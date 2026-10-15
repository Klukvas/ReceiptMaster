import { ConflictException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { Receipt } from "../entities/receipt.entity";
import { Order, OrderStatus } from "../../orders/entities/order.entity";
import { ConfigSelection } from "../../settings/document-config";
import { DocumentConfigService } from "../../settings/services/document-config.service";
import { DocumentAssetsService } from "../../settings/services/document-assets.service";
import {
  captureOrder,
  DocumentRenderService,
  orderFingerprint,
  RenderSnapshot,
} from "./document-render.service";
import { ApiErrors } from "../../../common/errors/ApiError";
import { legacyPdfOptions } from "./legacy-pdf-options";
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
  async prepare(
    userId: string,
    orderId: string,
    number: string,
    selection: ConfigSelection,
    file?: Express.Multer.File,
    frozenOrder?: RenderSnapshot["order"],
  ) {
    const order = await this.db.manager.findOne(Order, {
      where: { id: orderId, user_id: userId },
      relations: ["recipient", "items"],
    });
    if (!order) throw ApiErrors.ORDER_NOT_FOUND(orderId);
    if (order.status !== OrderStatus.CONFIRMED)
      throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(orderId);
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
    const prepared = await this.renders.prepare(
      userId,
      config,
      frozenOrder || captureOrder(order),
      number,
      logo,
    );
    return {
      ...prepared,
      snapshot: {
        ...prepared.snapshot,
        sourceRevision: resolved.revision,
        sourcePreset: resolved.preset,
      },
      fingerprint: orderFingerprint(order),
    };
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
      full.status !== OrderStatus.CONFIRMED
    )
      throw new ConflictException("Order changed. Refresh and generate again.");
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
    await this.assets.attach(
      userId,
      prepared.snapshot.config.logo.assetId,
      manager,
    );
    return full;
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
