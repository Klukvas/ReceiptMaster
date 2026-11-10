import { ConflictException, Injectable, Optional } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import {
  DocumentSignoffService,
  SignoffPointers,
} from "../../settings/services/document-signoff.service";
import { getTemplateCapabilities } from "../templates/metadata";
import { DocumentType, Receipt } from "../entities/receipt.entity";
import { Order } from "../../orders/entities/order.entity";
import { UserSettings } from "../../settings/entities/user-settings.entity";
import {
  ConfigSelection,
  DocumentConfig,
} from "../../settings/document-config";
import { DocumentConfigService } from "../../settings/services/document-config.service";
import { DocumentAssetsService } from "../../settings/services/document-assets.service";
import {
  captureOrder,
  DocumentRenderService,
  orderFingerprint,
  RenderSnapshot,
} from "./document-render.service";
import { ApiErrors } from "../../../common/errors/ApiError";
import { amountInWords } from "../../../common/utils/amount-in-words.util";
import { formatDocumentMoney } from "../../../common/utils/document-formatting.util";
import { legacyPdfOptions } from "./legacy-pdf-options";
import { specFor } from "../document-types";
import {
  buildBuyer,
  buildSeller,
  buyerFingerprint,
  evaluateRequisites,
} from "../document-requisites";
import {
  buildFrozenDocument,
  DocumentContext,
  DocumentRequest,
} from "../frozen-document";
import { assertTemplateSupportsDocument } from "../document-template-support";
import { assertReturnable, buildReturnedOrder } from "../return-note";
import { resolveReturnSource } from "../return-note-ledger";
import { createHash, randomUUID } from "crypto";

export const PRIVATE_RECEIPT_COLUMNS = [
  "html_snapshot",
  "active_snapshot",
  "pending_snapshot",
  "pending_html",
  "pending_id",
  "pending_expected_revision",
  "active_logo_asset_id",
  "pending_logo_asset_id",
] as const;
@Injectable()
export class ReceiptSnapshotService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly configs: DocumentConfigService,
    private readonly assets: DocumentAssetsService,
    private readonly renders: DocumentRenderService,
    @Optional() private readonly signoffs?: DocumentSignoffService,
  ) {}
  async lookup(
    id: string,
    userId: string,
    manager = this.db.manager,
  ): Promise<Receipt | null> {
    const row = await manager
      .getRepository(Receipt)
      .createQueryBuilder("r")
      .addSelect(PRIVATE_RECEIPT_COLUMNS.map((key) => `r.${key}`))
      .where("r.id=:id AND r.user_id=:userId", { id, userId })
      .getOne();
    return row;
  }
  async internal(
    id: string,
    userId: string,
    manager = this.db.manager,
  ): Promise<Receipt> {
    const row = await this.lookup(id, userId, manager);
    if (!row) throw ApiErrors.RECEIPT_NOT_FOUND(id);
    return row;
  }
  /** Only a type whose spec admits the order's status can be issued for it. */
  private assertOrderStatus(order: Order, type: DocumentType): void {
    if (!specFor(type).allowedOrderStatuses.includes(order.status))
      throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(order.id);
  }
  private async loadOrder(userId: string, orderId: string): Promise<Order> {
    const order = await this.db.manager.findOne(Order, {
      where: { id: orderId, user_id: userId },
      relations: ["recipient", "items"],
    });
    if (!order) throw ApiErrors.ORDER_NOT_FOUND(orderId);
    return order;
  }
  private async documentContext(
    userId: string,
    order: Order,
    request: DocumentRequest,
    config: DocumentConfig,
    manager: EntityManager = this.db.manager,
  ): Promise<DocumentContext> {
    const columns = await manager.findOne(UserSettings, { where: { userId } });
    // A replacement keeps the frozen source; a new return note looks it up now.
    const needsReturnSource =
      request.type === DocumentType.RETURN_NOTE && !request.carryOver?.details;
    return {
      request,
      seller: buildSeller(config.company, columns ?? {}),
      buyer: request.carryOver?.buyer ?? buildBuyer(order.recipient),
      defaultPaymentTermDays: columns?.defaultPaymentTermDays ?? null,
      ...(needsReturnSource
        ? {
            returnSource: await resolveReturnSource(
              manager,
              userId,
              order,
              config.formatting.timeZone,
            ),
          }
        : {}),
    };
  }
  /**
   * Every refusal that does not depend on the number (status, template, requisites, dates)
   * without staging anything, so a refused request never burns a document number.
   */
  /** What the document will print: the whole order, or for a return note the returned part only. */
  private printedOrder(
    order: Order,
    request: DocumentRequest | undefined,
  ): { total_cents: number; currency: string } {
    if (request?.type !== DocumentType.RETURN_NOTE) return order;
    const requested = request.details.lines;
    if (requested) {
      assertReturnable(order.items, requested);
      return buildReturnedOrder(order, requested);
    }
    // A replacement keeps the lines it already reserved; only the printed amount is judged.
    const frozen = request.carryOver?.details?.returnLines;
    return frozen ? buildReturnedOrder(order, frozen) : order;
  }

  async preflight(
    userId: string,
    orderId: string,
    selection: ConfigSelection,
    request: DocumentRequest,
  ): Promise<void> {
    const order = await this.loadOrder(userId, orderId);
    this.assertOrderStatus(order, request.type);
    const { config } = await this.configs.resolve(userId, selection);
    assertTemplateSupportsDocument(request.type, config.templateId);
    await this.configs.assertTemplate(userId, config.templateId);
    buildFrozenDocument(
      await this.documentContext(userId, order, request, config),
      config,
      new Date(),
    );
    // A document without money (the packing list) prints no amount, so a bad one cannot fail it.
    if (!specFor(request.type).requiresMoney) return;
    // A return note prints only the returned lines, so its quantities and amount are the ones judged.
    const printed = this.printedOrder(order, request);
    // The amount in words is drawn at render time; a bad currency or total must be refused now.
    try {
      amountInWords(
        printed.total_cents,
        printed.currency,
        config.documentLanguage,
      );
      formatDocumentMoney(
        printed.total_cents,
        printed.currency,
        config.formatting,
      );
    } catch {
      throw ApiErrors.DOCUMENT_AMOUNT_INVALID(orderId);
    }
  }
  async prepare(
    userId: string,
    orderId: string,
    number: string | ((timeZone: string, now: Date) => Promise<string>),
    selection: ConfigSelection,
    file?: Express.Multer.File,
    frozenOrder?: RenderSnapshot["order"],
    request?: DocumentRequest,
  ) {
    const order = await this.loadOrder(userId, orderId);
    this.assertOrderStatus(order, request?.type ?? DocumentType.WAYBILL);
    const resolved = await this.configs.resolve(userId, selection);
    const assetId = await this.assets.stage(
      userId,
      {
        config: resolved.config,
        logoAction:
          selection.logoAction === "keep" &&
          ((resolved.preset && !resolved.config.logo.assetId) ||
            (selection.overrides?.logo &&
              Object.prototype.hasOwnProperty.call(
                selection.overrides.logo,
                "assetId",
              ) &&
              selection.overrides.logo.assetId === null))
            ? "remove"
            : selection.logoAction,
      },
      file,
    );
    const config = {
      ...resolved.config,
      logo: { ...resolved.config.logo, assetId },
    };
    const logo = assetId ? await this.assets.read(userId, assetId) : undefined;
    const context = request
      ? await this.documentContext(userId, order, request, config)
      : undefined;
    // Read last, closest to the render; validatePrepared re-checks the pointers under the lock.
    const signoffLoad = getTemplateCapabilities(config.templateId).signoff
      ? await this.signoffs?.load(userId)
      : undefined;
    // One instant for the number's year and the document's issue date, so they cannot
    // disagree across midnight in the document's zone.
    const now = new Date();
    // A lazy number is drawn only now, after everything that can fail for lack of a file.
    const resolvedNumber =
      typeof number === "string"
        ? number
        : await number(config.formatting.timeZone, now);
    const prepared = await this.renders.prepare(
      userId,
      config,
      frozenOrder || this.orderToFreeze(order, request),
      resolvedNumber,
      logo,
      context,
      signoffLoad?.source,
      now,
    );
    return {
      ...prepared,
      number: resolvedNumber,
      snapshot: {
        ...prepared.snapshot,
        sourceRevision: resolved.revision,
        sourcePreset: resolved.preset,
      },
      // Pointers as read, usable or not: validatePrepared compares them, not the embedded ids.
      signoffPointers: signoffLoad?.pointers,
      signoffUnavailable: signoffLoad?.unavailable ?? [],
      fingerprint: orderFingerprint(order),
      // Set only when the buyer is read live; a frozen buyer is not compared to the recipient.
      liveBuyerFingerprint:
        request && !request.carryOver?.buyer
          ? buyerFingerprint(buildBuyer(order.recipient))
          : null,
    };
  }
  private orderToFreeze(order: Order, request?: DocumentRequest) {
    // A reconstruction (no frozen order left) still returns only the frozen lines.
    const lines =
      request?.type === DocumentType.RETURN_NOTE
        ? (request.details.lines ?? request.carryOver?.details?.returnLines)
        : undefined;
    return lines ? buildReturnedOrder(order, lines) : captureOrder(order);
  }

  async validatePrepared(
    userId: string,
    orderId: string,
    prepared: Awaited<ReturnType<ReceiptSnapshotService["prepare"]>>,
    manager: EntityManager,
  ): Promise<Order> {
    await this.configs.lock(userId, manager);
    const order = await manager.findOne(Order, {
      where: { id: orderId, user_id: userId },
      lock: { mode: "pessimistic_write" },
    });
    if (!order) throw ApiErrors.ORDER_NOT_FOUND(orderId);
    // Lock the recipient as well as the order; its contact values contribute to the snapshot.
    await manager.query(
      "SELECT id FROM recipients WHERE id=$1 AND user_id=$2 FOR SHARE",
      [order.recipient_id, userId],
    );
    const full = await manager.findOne(Order, {
      where: { id: orderId, user_id: userId },
      relations: ["recipient", "items"],
    });
    if (
      !full ||
      orderFingerprint(full) !== prepared.fingerprint ||
      !specFor(
        prepared.snapshot.document?.type ?? DocumentType.WAYBILL,
      ).allowedOrderStatuses.includes(full.status)
    )
      throw new ConflictException("Order changed. Refresh and generate again.");
    if (
      prepared.liveBuyerFingerprint !== null &&
      buyerFingerprint(buildBuyer(full.recipient)) !==
        prepared.liveBuyerFingerprint
    )
      throw new ConflictException("Order changed. Refresh and generate again.");
    await this.recheckRequisites(userId, prepared.snapshot, manager);
    if (
      (await this.configs.read(userId, manager)).revision !==
      prepared.snapshot.sourceRevision
    )
      throw new ConflictException(
        "Defaults changed. Refresh and generate again.",
      );
    if (prepared.snapshot.sourcePreset) {
      const preset = await this.configs.preset(
        userId,
        prepared.snapshot.sourcePreset.id,
        manager,
      );
      if (preset.revision !== prepared.snapshot.sourcePreset.revision)
        throw new ConflictException(
          "Preset changed. Refresh and generate again.",
        );
    }
    await this.configs.assertTemplate(
      userId,
      prepared.snapshot.config.templateId,
      manager,
    );
    await this.assertSignoffUnchanged(
      userId,
      prepared.signoffPointers,
      manager,
    );
    await this.assets.attach(
      userId,
      prepared.snapshot.config.logo.assetId,
      manager,
    );
    return full;
  }
  /**
   * A signature or stamp removed or replaced while the document was being prepared must
   * not slip into it: the settings lock is held, so the pointers are final here.
   */
  private async assertSignoffUnchanged(
    userId: string,
    read: SignoffPointers | undefined,
    manager: EntityManager,
  ): Promise<void> {
    // Undefined: the style prints no images, so there is nothing to go stale.
    if (!this.signoffs || !read) return;
    const current = await this.signoffs.pointers(userId, manager);
    if (current.signature !== read.signature || current.stamp !== read.stamp)
      throw new ConflictException(
        "Defaults changed. Refresh and generate again.",
      );
  }
  /**
   * Second requisites check, inside the transaction and under the settings lock: the
   * snapshot was built outside it. Seller columns are compared by value, not by revision.
   */
  private async recheckRequisites(
    userId: string,
    snapshot: RenderSnapshot,
    manager: EntityManager,
  ): Promise<void> {
    const document = snapshot.document;
    if (!document) return;
    const columns = await manager.findOne(UserSettings, { where: { userId } });
    const seller = buildSeller(snapshot.config.company, columns ?? {});
    const { missing, warnings } = evaluateRequisites(
      document.type,
      seller,
      document.buyer,
      document.details,
    );
    if (missing.length > 0)
      throw ApiErrors.DOCUMENT_REQUISITES_MISSING(
        document.type,
        missing,
        warnings,
      );
  }
  candidate(
    prepared: { html: string; snapshot: RenderSnapshot },
    revision: number,
  ) {
    return {
      pending_id: randomUUID(),
      pending_html: prepared.html,
      pending_snapshot: prepared.snapshot,
      pending_expected_revision: revision,
      pending_logo_asset_id: prepared.snapshot.config?.logo.assetId || null,
    };
  }
  async releaseLogo(
    userId: string,
    assetId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    await this.assets.release(userId, assetId, manager);
  }
  legacy(receipt: Receipt): { html: string; snapshot: RenderSnapshot } {
    if (
      !receipt.html_snapshot ||
      !/^<!doctype html/i.test(receipt.html_snapshot.trim()) ||
      !receipt.template_id ||
      /(?:src|href)\s*=\s*["'](?:https?:|file:|\/\/)|@import/i.test(
        receipt.html_snapshot,
      )
    )
      throw new ConflictException({
        errorCode: "RECONSTRUCTION_REQUIRED",
        message:
          "No trustworthy frozen snapshot. Explicitly replace and confirm reconstruction; the existing PDF remains available.",
      });
    // Legacy options are known template options, not asserted historical bytes/timezones.
    return {
      html: receipt.html_snapshot,
      snapshot: {
        options: legacyPdfOptions(receipt.template_id),
        htmlHash: createHash("sha256")
          .update(receipt.html_snapshot)
          .digest("hex"),
        templateRevision: receipt.template_version || 1,
        reconstructed: true,
      } as RenderSnapshot,
    };
  }
  active(receipt: Receipt) {
    return receipt.active_snapshot && receipt.html_snapshot
      ? { html: receipt.html_snapshot, snapshot: receipt.active_snapshot }
      : this.legacy(receipt);
  }
}
