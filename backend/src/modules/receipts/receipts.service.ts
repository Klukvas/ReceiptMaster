import { DocumentConfigService } from "../settings/services/document-config.service";
import {
  DocumentRenderService,
  sampleOrder,
} from "./services/document-render.service";
import { ConflictException, Optional } from "@nestjs/common";
import { ConfigSelection } from "../settings/document-config";
import { ReceiptSnapshotService } from "./services/receipt-snapshot.service";
import { ReceiptArtifactService } from "./services/receipt-artifact.service";
import { Injectable, Logger } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { isUniqueViolationOf } from "../../common/utils/unique-violation.util";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import {
  Repository,
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Not,
} from "typeorm";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "./entities/receipt.entity";
import { Order } from "../orders/entities/order.entity";
import {
  GeneratableDocumentType,
  hasDocumentBlock,
  isGeneratableType,
  isReissuableType,
  specFor,
} from "./document-types";
import type { DocumentDetailsInput, DocumentRequest } from "./frozen-document";
import {
  PdfGeneratorService,
  ReceiptStyle,
} from "./services/pdf-generator.service";
import { KeyedMutex } from "../../common/utils/keyed-mutex.util";
import { nextDocumentNumber, releaseDocumentNumber } from "./receipt-number";
import { DOCUMENTS_RETAINED_PER_TYPE } from "./document-retention";
import { isLockingDocumentType, syncOrderLock } from "./order-lock";
import {
  frozenReturnLines,
  releaseReturnQuantities,
  reserveReturnQuantities,
} from "./return-note-ledger";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { User } from "../users/entities/user.entity";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { ConfigService } from "@nestjs/config";
import { SettingsService } from "../settings/services/settings.service";

import { ReceiptGenerationOutbox } from "./entities/receipt-generation-outbox.entity";
import { ReceiptOutboxService } from "./receipt-outbox.service";
import { runWithPublicToken } from "../../common/tenancy/tenant-context";

const execFileAsync = promisify(execFile);

/** Only allow alphanumeric, hyphens, underscores, dots, and spaces in printer names */
const SAFE_PRINTER_NAME = /^[a-zA-Z0-9_\-. ]+$/;

/** Recorded on documents voided because their order was cancelled. */
export const ORDER_CANCELLED_VOID_REASON = "order_cancelled";

/**
 * Column values that void a document: it stops being public (token revoked),
 * and any pending candidate or replacement is dropped so no delayed worker can
 * promote it. The active PDF and its frozen content stay as history.
 */
function voidedReceiptFields(reason: string, voidedAt: Date) {
  return {
    status: ReceiptStatus.VOID,
    voided_at: voidedAt,
    void_reason: reason,
    public_token: null,
    replacement_status: null,
    replacement_error: null,
    pending_id: null,
    pending_snapshot: null,
    pending_html: null,
    pending_logo_asset_id: null,
    pending_expected_revision: null,
  };
}

/** The waybill keeps its historical file name; the other types are named by type. */
export function documentFilename(receipt: {
  document_type?: DocumentType;
  number: string;
}): string {
  // Rows from before document types existed are waybills.
  const type = receipt.document_type ?? DocumentType.WAYBILL;
  return type === DocumentType.WAYBILL
    ? `receipt-${receipt.number}.pdf`
    : `${type}-${receipt.number}.pdf`;
}

/** The waybill route keeps its original error and wording whichever endpoint asks. */
function documentAlreadyExists(orderId: string, type: DocumentType) {
  return type === DocumentType.WAYBILL
    ? ApiErrors.RECEIPT_ALREADY_EXISTS(orderId)
    : ApiErrors.DOCUMENT_ALREADY_EXISTS(orderId, type);
}

const ORDER_TYPE_UNIQUE_INDEX = "IDX_receipts_order_document_type";

/**
 * A voided document stays on its order as history. For an invoice, act or quotation it frees the slot
 * for a reissue; any other type stays closed, so a voided one still blocks a new one.
 */
async function hasClosedVoidedDocument(
  countRows: (where: FindOptionsWhere<Receipt>) => Promise<number>,
  userId: string,
  orderId: string,
  type: DocumentType,
): Promise<boolean> {
  if (isReissuableType(type)) return false;
  const voided = await countRows({
    order_id: orderId,
    user_id: userId,
    document_type: type,
    status: ReceiptStatus.VOID,
  });
  return voided > 0;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly generationMutex = new KeyedMutex();
  /** A PROCESSING receipt older than this is treated as stuck and may be retried. */

  constructor(
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private pdfGeneratorService: PdfGeneratorService,
    private pdfStorageService: PdfStorageService,
    @InjectDataSource()
    private dataSource: DataSource,
    private configService: ConfigService,
    private settingsService: SettingsService,
    private receiptOutbox: ReceiptOutboxService,
    @Optional() private readonly snapshots?: ReceiptSnapshotService,
    @Optional() private readonly artifacts?: ReceiptArtifactService,
    @Optional() private readonly documents?: DocumentConfigService,
    @Optional() private readonly renders?: DocumentRenderService,
  ) {}

  private getReceiptStyleFromTemplateId(templateId: string): ReceiptStyle {
    switch (templateId) {
      case "standard":
        return ReceiptStyle.STANDARD;
      case "compact":
        return ReceiptStyle.COMPACT;
      case "classic":
        return ReceiptStyle.CLASSIC;
      case "modern":
        return ReceiptStyle.MODERN;
      case "elegant":
        return ReceiptStyle.ELEGANT;
      case "vintage":
        return ReceiptStyle.VINTAGE;
      case "tech":
        return ReceiptStyle.TECH;
      case "wave":
        return ReceiptStyle.WAVE;
      case "minimal":
        return ReceiptStyle.MINIMAL;
      case "corporate":
        return ReceiptStyle.CORPORATE;
      case "thermal":
        return ReceiptStyle.THERMAL;
      case "dark":
        return ReceiptStyle.DARK;
      case "branded":
        return ReceiptStyle.BRANDED;
      case "delivery":
        return ReceiptStyle.DELIVERY;
      case "proforma":
        return ReceiptStyle.PROFORMA;
      default:
        this.logger.warn(
          `Unknown template ID: ${templateId}, falling back to COMPACT`,
        );
        return ReceiptStyle.COMPACT;
    }
  }

  async generateReceipt(
    orderId: string,
    user: User,
    selection: ConfigSelection = { logoAction: "keep" },
    file?: Express.Multer.File,
  ): Promise<Receipt> {
    return this.generateDocument(
      orderId,
      user,
      DocumentType.WAYBILL,
      selection,
      undefined,
      file,
    );
  }

  /**
   * One generation pipeline for every generatable type. Each type has its own row per
   * order (unique index), its own numbering and its own retention.
   */
  async generateDocument(
    orderId: string,
    user: User,
    type: DocumentType,
    selection: ConfigSelection = { logoAction: "keep" },
    details?: DocumentDetailsInput,
    file?: Express.Multer.File,
  ): Promise<Receipt> {
    if (!isGeneratableType(type))
      throw ApiErrors.DOCUMENT_TYPE_NOT_SUPPORTED(type);
    // A type that allows several per order has no slot to race for: the order lock and the
    // quantity ledger serialize it, so the in-process mutex below would add nothing.
    if (!hasDocumentBlock(type) || specFor(type).multiplePerOrder)
      return this.runGeneration(orderId, user, type, selection, details, file);
    // Two requests for the same order and type must not both allocate a number: the second
    // waits, then finds the first one's PROCESSING row and returns it. In-process on purpose:
    // a lock-holding transaction around logo upload would pin a pooled connection per request.
    // Across processes the unique row index still allows one row; a rare loser may burn a number.
    return this.generationMutex.runExclusive(
      `${user.id}:${orderId}:${type}`,
      () => this.runGeneration(orderId, user, type, selection, details, file),
    );
  }

  private async releaseDrawnNumber(
    userId: string,
    type: DocumentType,
    number: string | undefined,
  ): Promise<void> {
    if (!number) return;
    try {
      await releaseDocumentNumber(
        this.dataSource.manager,
        userId,
        type,
        number,
      );
    } catch (error) {
      // The original failure matters more; a leftover gap is harmless.
      this.logger.warn(`Could not release ${type} number ${number}: ${error}`);
    }
  }

  private async runGeneration(
    orderId: string,
    user: User,
    type: GeneratableDocumentType,
    selection: ConfigSelection,
    details?: DocumentDetailsInput,
    file?: Express.Multer.File,
  ): Promise<Receipt> {
    const spec = specFor(type);
    const hasSingleSlot = !spec.multiplePerOrder;
    // Voided rows are history, never a row to resume: a reissue starts fresh.
    const prior = hasSingleSlot
      ? await this.receiptsRepository.findOne({
          where: {
            order_id: orderId,
            user_id: user.id,
            document_type: type,
            status: Not(ReceiptStatus.VOID),
          },
        })
      : null;
    if (prior?.status === ReceiptStatus.PROCESSING && prior.generation_id)
      return prior;
    if (prior?.status === ReceiptStatus.GENERATED)
      throw documentAlreadyExists(orderId, type);
    if (
      !prior &&
      hasSingleSlot &&
      (await hasClosedVoidedDocument(
        (where) => this.receiptsRepository.count({ where }),
        user.id,
        orderId,
        type,
      ))
    )
      throw documentAlreadyExists(orderId, type);
    const previous = prior
      ? await this.snapshots.internal(prior.id, user.id)
      : undefined;
    const explicitConfig = Boolean(
      selection.config ||
        selection.presetId ||
        selection.overrides ||
        file ||
        selection.logoAction !== "keep" ||
        // `{}` is the schema default, not an instruction to rebuild.
        (details && Object.keys(details).length > 0),
    );
    const retryFrozen =
      previous?.pending_snapshot && previous.pending_html && !explicitConfig;
    if (previous && !previous.pending_snapshot && !explicitConfig)
      throw new ConflictException({
        errorCode: "RECONSTRUCTION_REQUIRED",
        message:
          "No frozen candidate exists. Customize this document explicitly to reconstruct it.",
      });
    const frozenBuyer = previous?.pending_snapshot?.document?.buyer;
    const request: DocumentRequest | undefined = hasDocumentBlock(type)
      ? {
          type,
          details: details ?? {},
          carryOver: frozenBuyer ? { buyer: frozenBuyer } : undefined,
        }
      : undefined;
    // Every refusal that can be known without a number comes first, so it never burns one.
    if (request && !retryFrozen)
      await this.snapshots.preflight(user.id, orderId, selection, request);
    // A number drawn here but never committed is handed back below, so a late refusal
    // does not leave a gap in the sequence.
    let drawnNumber: string | undefined;
    const allocateNumber = async () => {
      if (prior?.number) return prior.number;
      drawnNumber = await nextDocumentNumber(
        this.dataSource.manager,
        user.id,
        type,
      );
      return drawnNumber;
    };
    let receipt: Receipt;
    try {
      // A waybill takes its number first, as it always did. Invoice and act take it only after
      // the logo is staged (bad file, quota, upload failure) so those refusals never burn one.
      const eagerNumber = request ? undefined : await allocateNumber();
      const prepared = retryFrozen
        ? undefined
        : await this.snapshots.prepare(
            user.id,
            orderId,
            eagerNumber ?? allocateNumber,
            selection,
            file,
            previous?.pending_snapshot?.order,
            request,
          );
      const number =
        eagerNumber ?? prepared?.number ?? (await allocateNumber());
      if (prepared && previous && !previous.pending_snapshot?.order)
        prepared.snapshot = { ...prepared.snapshot, reconstructed: true };
      receipt = await this.dataSource.transaction(async (manager) => {
        // Serialize tenant quota, then order identity and source validation. No external I/O here.
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
          [user.id],
        );
        const order = prepared
          ? await this.snapshots.validatePrepared(
              user.id,
              orderId,
              prepared,
              manager,
            )
          : await manager.findOne(Order, {
              where: { id: orderId, user_id: user.id },
              lock: { mode: "pessimistic_write" },
            });
        if (!order || !spec.allowedOrderStatuses.includes(order.status))
          throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(orderId);
        // The order row is locked here, so the quantity check cannot race another note.
        if (type === DocumentType.RETURN_NOTE)
          await reserveReturnQuantities(
            manager,
            user.id,
            orderId,
            prepared?.snapshot.document?.details.returnLines ?? [],
          );
        const existing = hasSingleSlot
          ? await manager.findOne(Receipt, {
              where: {
                order_id: orderId,
                user_id: user.id,
                document_type: type,
                status: Not(ReceiptStatus.VOID),
              },
            })
          : null;
        if (
          existing?.status === ReceiptStatus.PROCESSING &&
          existing.generation_id
        )
          return existing;
        if (existing?.status === ReceiptStatus.GENERATED)
          throw documentAlreadyExists(orderId, type);
        if (
          !existing &&
          hasSingleSlot &&
          (await hasClosedVoidedDocument(
            (where) => manager.count(Receipt, { where }),
            user.id,
            orderId,
            type,
          ))
        )
          throw documentAlreadyExists(orderId, type);
        if (previous && existing?.generation_id !== previous.generation_id)
          throw new ConflictException("Generation changed; refresh and retry");
        const generationId = crypto.randomUUID();
        const candidate = prepared
          ? this.snapshots.candidate(prepared, existing?.active_revision || 0)
          : {};
        let result: Receipt;
        if (existing) {
          await manager.update(
            Receipt,
            { id: existing.id, user_id: user.id },
            {
              ...candidate,
              status: ReceiptStatus.PROCESSING,
              progress: 0,
              error_message: null,
              generation_id: generationId,
              generation_started_at: new Date(),
            },
          );
          result = await manager.findOneOrFail(Receipt, {
            where: { id: existing.id, user_id: user.id },
          });
        } else {
          await this.cleanupOldReceipts(manager, user.id, type);
          result = await manager.save(
            Receipt,
            manager.create(Receipt, {
              ...candidate,
              order_id: orderId,
              document_type: type,
              number,
              status: ReceiptStatus.PROCESSING,
              active_revision: 0,
              progress: 0,
              user_id: user.id,
              generation_id: generationId,
              generation_started_at: new Date(),
            }),
          );
        }
        await manager.save(
          ReceiptGenerationOutbox,
          manager.create(ReceiptGenerationOutbox, {
            id: crypto.randomUUID(),
            receipt_id: result.id,
            order_id: orderId,
            user_id: user.id,
            generation_id: generationId,
            published_at: null,
          }),
        );
        return result;
      });
    } catch (error) {
      await this.releaseDrawnNumber(user.id, type, drawnNumber);
      // Another process won the slot between our check and insert (the mutex is per process).
      if (isUniqueViolationOf(error, ORDER_TYPE_UNIQUE_INDEX)) {
        const winner = await this.receiptsRepository.findOne({
          where: {
            order_id: orderId,
            user_id: user.id,
            document_type: type,
            status: Not(ReceiptStatus.VOID),
          },
        });
        if (winner?.status === ReceiptStatus.PROCESSING && winner.generation_id)
          return winner;
        throw documentAlreadyExists(orderId, type);
      }
      throw error;
    }
    if (drawnNumber && receipt.number !== drawnNumber)
      await this.releaseDrawnNumber(user.id, type, drawnNumber);
    void this.receiptOutbox.dispatch();
    return receipt;
  }

  async generateCompactReceipt(orderId: string, user: User): Promise<Receipt> {
    // Delegates to generateReceipt — template style is determined by user settings
    return this.generateReceipt(orderId, user);
  }

  async generateStandardReceipt(orderId: string, user: User): Promise<Receipt> {
    // Delegates to generateReceipt — template style is determined by user settings
    return this.generateReceipt(orderId, user);
  }

  async generateTestReceipt(user: User): Promise<Buffer> {
    const { config } = await this.documents.read(user.id);
    await this.documents.assertTemplate(user.id, config.templateId);
    return this.renders.preview(
      user.id,
      { config, logoAction: "keep" },
      sampleOrder(user.id),
    );
  }

  async voidReceipt(id: string, user: User, reason: string): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      const observed = await manager.findOne(Receipt, {
        where: { id, user_id: user.id },
      });
      if (!observed) throw ApiErrors.RECEIPT_NOT_FOUND(id);
      // Same order -> receipt lock order as candidate promotion and replacement.
      await manager.findOne(Order, {
        where: { id: observed.order_id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });
      const receipt = await manager.findOne(Receipt, {
        where: { id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });

      if (!receipt) {
        throw ApiErrors.RECEIPT_NOT_FOUND(id);
      }

      if (receipt.status === ReceiptStatus.VOID) {
        throw ApiErrors.BAD_REQUEST(`Receipt ${id} is already voided`);
      }

      // The snapshot is read before the void clears the candidate that may hold it.
      // A failed note already gave its quantities back.
      const returnLines =
        receipt.status === ReceiptStatus.FAILED
          ? []
          : await this.returnLinesToRelease(receipt, user.id, manager);

      // Void the receipt and revoke any public share link (immutable update)
      await manager.update(
        Receipt,
        { id: receipt.id, user_id: user.id },
        voidedReceiptFields(reason, new Date()),
      );
      await this.releaseReturn(manager, receipt, user.id, returnLines);
      const savedReceipt = await manager.findOneOrFail(Receipt, {
        where: { id: receipt.id, user_id: user.id },
        relations: ["order"],
      });

      // The order stays locked while another locking document of it is still issued.
      const isOrderLocked = await syncOrderLock(
        manager,
        receipt.order_id,
        user.id,
      );

      this.logger.log(
        `Receipt ${receipt.number} voided. Order ${receipt.order_id} ${
          isOrderLocked ? "stays locked" : "unlocked"
        }.`,
      );

      return savedReceipt;
    });
  }

  private async returnLinesToRelease(
    receipt: Receipt,
    userId: string,
    manager: EntityManager,
  ) {
    if (receipt.document_type !== DocumentType.RETURN_NOTE) return [];
    const lines = frozenReturnLines(
      await this.snapshots.internal(receipt.id, userId, manager),
    );
    // Voiding goes ahead, but quantities that cannot be found cannot be given back.
    if (lines.length === 0)
      this.logger.warn(
        `Return note ${receipt.id} (order ${receipt.order_id}) has no readable lines; its quantities were not released`,
      );
    return lines;
  }

  /** A voided return note gives its quantities back so the goods can be returned again. */
  private async releaseReturn(
    manager: EntityManager,
    receipt: Receipt,
    userId: string,
    lines: Parameters<typeof releaseReturnQuantities>[3],
  ): Promise<void> {
    if (lines.length === 0) return;
    const unreleased = await releaseReturnQuantities(
      manager,
      userId,
      receipt.order_id,
      lines,
    );
    if (unreleased.length > 0)
      this.logger.warn(
        `Return note ${receipt.number}: ${unreleased.length} line(s) had no returned quantity left to release`,
      );
  }

  /**
   * Voids every live document of an order being cancelled, inside the caller's
   * transaction, which already holds the tenant lock and the order row lock.
   * Receipts are locked in id order (tenant → order → receipt, as everywhere
   * else). Already voided documents keep their original reason. Unlike a manual
   * void, the order is not unlocked: a cancelled order is never edited again.
   * Returns how many documents were voided.
   */
  async voidForCancellation(
    manager: EntityManager,
    orderId: string,
    userId: string,
  ): Promise<number> {
    const live = await manager.find(Receipt, {
      where: {
        order_id: orderId,
        user_id: userId,
        status: Not(ReceiptStatus.VOID),
      },
      select: [
        "id",
        "user_id",
        "active_logo_asset_id",
        "pending_logo_asset_id",
      ],
      order: { id: "ASC" },
      lock: { mode: "pessimistic_write" },
    });
    const voidedAt = new Date();
    for (const receipt of live) {
      await manager.update(
        Receipt,
        { id: receipt.id, user_id: userId, status: Not(ReceiptStatus.VOID) },
        voidedReceiptFields(ORDER_CANCELLED_VOID_REASON, voidedAt),
      );
      // The dropped candidate's own logo starts its cleanup grace; the active
      // logo stays referenced by the voided document's history.
      if (
        receipt.pending_logo_asset_id &&
        receipt.pending_logo_asset_id !== receipt.active_logo_asset_id
      )
        await this.snapshots.releaseLogo(
          userId,
          receipt.pending_logo_asset_id,
          manager,
        );
    }
    if (live.length > 0)
      this.logger.log(
        `Order ${orderId} cancelled: voided ${live.length} document(s)`,
      );
    return live.length;
  }

  /**
   * Revokes the public link of every document of orders being deleted, in the caller's
   * transaction: a deleted order must not stay reachable by an old link. Statuses and
   * files are left alone, as a deleted order's documents are not touched otherwise.
   * Returns how many links were revoked.
   */
  async revokePublicLinksForOrders(
    manager: EntityManager,
    orderIds: string[],
    userId: string,
  ): Promise<number> {
    if (orderIds.length === 0) return 0;
    const result = await manager.update(
      Receipt,
      { order_id: In(orderIds), user_id: userId, public_token: Not(IsNull()) },
      { public_token: null },
    );
    return result.affected ?? 0;
  }

  async findAll(
    user: User,
    options?: { offset?: number; limit?: number; type?: DocumentType },
  ): Promise<{
    data: Receipt[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const offset = options?.offset ?? 0;
    const limit = Math.min(options?.limit ?? 20, 100);

    const [data, total] = await this.receiptsRepository.findAndCount({
      where: {
        user_id: user.id,
        ...(options?.type ? { document_type: options.type } : {}),
      },
      relations: ["order", "order.recipient"],
      order: { created_at: "DESC" },
      skip: offset,
      take: limit,
    });

    return { data, total, offset, limit };
  }

  /**
   * How close the account is to the retention cap and which receipt the next one would
   * replace, so the UI can ask before an old receipt (and its public link) disappears.
   */
  async getRetention(
    user: User,
    type: DocumentType = DocumentType.WAYBILL,
  ): Promise<{
    limit: number;
    count: number;
    replaces: { id: string; number: string; order_id: string } | null;
  }> {
    const where = {
      user_id: user.id,
      status: ReceiptStatus.GENERATED,
      document_type: type,
    };
    const count = await this.receiptsRepository.count({ where });
    if (count < DOCUMENTS_RETAINED_PER_TYPE) {
      return { limit: DOCUMENTS_RETAINED_PER_TYPE, count, replaces: null };
    }

    const oldest = await this.receiptsRepository.findOne({
      where,
      order: { created_at: "ASC", id: "ASC" },
    });
    return {
      limit: DOCUMENTS_RETAINED_PER_TYPE,
      count,
      replaces: oldest
        ? { id: oldest.id, number: oldest.number, order_id: oldest.order_id }
        : null,
    };
  }

  async findOne(id: string, user: User): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id, user_id: user.id },
      relations: ["order", "order.recipient", "order.items"],
    });
    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(id);
    }
    return receipt;
  }

  async getReceiptPdf(
    id: string,
    user: User,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.findOne(id, user);

    const filename = documentFilename(receipt);
    if (!receipt.pdf_path)
      return {
        buffer: await this.artifacts.repair(receipt.id, user.id),
        filename,
      };
    if (receipt.pdf_path.startsWith("object-storage://")) {
      const parsed = this.pdfStorageService.parseObjectStoragePath(
        receipt.pdf_path,
      );
      if (!parsed)
        throw ApiErrors.VALIDATION_ERROR("pdf_path", "Invalid stored PDF path");
      if (await this.pdfStorageService.fileExists(parsed.bucket, parsed.key)) {
        return {
          buffer: await this.pdfStorageService.downloadFile(
            parsed.bucket,
            parsed.key,
          ),
          filename,
        };
      }
    } else {
      try {
        return { buffer: await fs.readFile(receipt.pdf_path), filename };
      } catch (error) {
        if (
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
    }
    this.logger.warn(
      `PDF missing for ${receipt.id}; repairing from frozen content`,
    );
    return {
      buffer: await this.artifacts.repair(receipt.id, user.id),
      filename,
    };
  }

  async regenerateReceiptPdf(
    id: string,
    user: User,
    input: {
      mode?: "reproduce" | "replace";
      expectedActiveRevision?: number;
      confirmReconstruction?: boolean;
      selection?: ConfigSelection;
    } = {},
    file?: Express.Multer.File,
  ): Promise<Receipt> {
    const original = await this.snapshots.internal(id, user.id);
    if (
      ![ReceiptStatus.GENERATED, ReceiptStatus.FAILED].includes(original.status)
    )
      throw new ConflictException("Document is not ready for replacement");
    // Its quantities were released when it failed; a retry would use them a second time.
    if (
      original.document_type === DocumentType.RETURN_NOTE &&
      original.status === ReceiptStatus.FAILED
    )
      throw new ConflictException(
        "A failed return note cannot be retried; issue a new one.",
      );
    const revision = original.active_revision || 0;
    if (
      input.expectedActiveRevision !== undefined &&
      input.expectedActiveRevision !== revision
    )
      throw new ConflictException("Document changed. Reload before replacing.");
    const mode = input.mode || "reproduce";
    if (mode === "replace" && input.expectedActiveRevision === undefined)
      throw new ConflictException("Expected active revision is required");
    if (
      mode === "replace" &&
      !original.active_snapshot?.order &&
      !original.pending_snapshot?.order &&
      !input.confirmReconstruction
    )
      throw new ConflictException({
        errorCode: "RECONSTRUCTION_REQUIRED",
        message:
          "Confirm reconstruction with current transaction data; historical fidelity is unavailable.",
      });
    const prepared =
      mode === "replace"
        ? await this.snapshots.prepare(
            user.id,
            original.order_id,
            original.number,
            input.selection || { logoAction: "keep" },
            file,
            original.active_snapshot?.order || original.pending_snapshot?.order,
            this.replacementRequest(original),
          )
        : undefined;
    if (
      prepared &&
      !original.active_snapshot?.order &&
      !original.pending_snapshot?.order
    )
      prepared.snapshot = { ...prepared.snapshot, reconstructed: true };
    const frozen =
      prepared ||
      (original.pending_snapshot &&
      original.pending_html &&
      (original.replacement_status === "failed" ||
        original.status === ReceiptStatus.FAILED)
        ? { html: original.pending_html, snapshot: original.pending_snapshot }
        : this.snapshots.active(original));
    const result = await this.dataSource.transaction(async (manager) => {
      if (prepared) {
        const order = await this.snapshots.validatePrepared(
          user.id,
          original.order_id,
          prepared,
          manager,
        );
        if (
          original.status === ReceiptStatus.GENERATED &&
          isLockingDocumentType(original.document_type) &&
          !order.is_locked
        )
          throw new ConflictException(
            "Order must remain locked during replacement",
          );
      }
      const receipt = await manager.findOne(Receipt, {
        where: { id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !receipt ||
        receipt.status !== original.status ||
        (receipt.active_revision || 0) !== revision ||
        receipt.generation_id !== original.generation_id ||
        receipt.replacement_status === "processing"
      )
        throw new ConflictException(
          "Document changed or replacement is running. Reload before replacing.",
        );
      const generationId = crypto.randomUUID();
      await manager.update(
        Receipt,
        { id, user_id: user.id },
        {
          ...this.snapshots.candidate(frozen, revision),
          generation_id: generationId,
          generation_started_at: new Date(),
          ...(receipt.status === ReceiptStatus.GENERATED
            ? {
                replacement_status: "processing" as const,
                replacement_error: null,
              }
            : {
                status: ReceiptStatus.PROCESSING,
                progress: 0,
                error_message: null,
              }),
        },
      );
      await manager.save(
        ReceiptGenerationOutbox,
        manager.create(ReceiptGenerationOutbox, {
          id: crypto.randomUUID(),
          receipt_id: id,
          order_id: receipt.order_id,
          user_id: user.id,
          generation_id: generationId,
          published_at: null,
        }),
      );
      return manager.findOneOrFail(Receipt, {
        where: { id, user_id: user.id },
      });
    });
    void this.receiptOutbox.dispatch();
    return result;
  }

  /**
   * A replacement keeps what makes it the same document: buyer, issue date, the
   * resolved details and the VAT rate. Seller, configuration and heading are rebuilt from today's settings.
   */
  private replacementRequest(original: Receipt): DocumentRequest | undefined {
    if (!hasDocumentBlock(original.document_type)) return undefined;
    if (!isGeneratableType(original.document_type))
      throw ApiErrors.DOCUMENT_TYPE_NOT_SUPPORTED(original.document_type);
    const frozen =
      original.active_snapshot?.document ?? original.pending_snapshot?.document;
    return {
      type: original.document_type,
      details: {},
      carryOver: frozen
        ? {
            buyer: frozen.buyer,
            issueDate: frozen.issueDate,
            details: frozen.details,
            vatRatePercent: frozen.vatRatePercent,
          }
        : undefined,
    };
  }

  /** Retire immutable keys transactionally; the scheduled collector handles storage after grace. */
  private async cleanupOldReceipts(
    manager: EntityManager,
    userId: string,
    type: DocumentType,
  ): Promise<void> {
    const where = {
      user_id: userId,
      status: ReceiptStatus.GENERATED,
      document_type: type,
    };
    const total = await manager.count(Receipt, { where });
    if (total < DOCUMENTS_RETAINED_PER_TYPE) return;
    const old = await manager.find(Receipt, {
      where,
      select: [
        "id",
        "user_id",
        "pdf_path",
        "active_logo_asset_id",
        "pending_logo_asset_id",
      ],
      order: { created_at: "ASC", id: "ASC" },
      take: total - (DOCUMENTS_RETAINED_PER_TYPE - 1),
    });
    const locked = await this.artifacts.lockRetirements(old, userId, manager);
    for (const receipt of locked) await this.artifacts.retire(receipt, manager);
    for (const receipt of locked)
      await manager.delete(Receipt, {
        id: receipt.id,
        user_id: userId,
        status: ReceiptStatus.GENERATED,
      });
  }

  async getAvailablePrinters(): Promise<{ printers: string[] }> {
    try {
      const platform = process.platform;
      let stdout: string;

      if (platform === "darwin" || platform === "linux") {
        const result = await execFileAsync("lpstat", ["-p"]);
        stdout = result.stdout;
        // Parse "printer <name> ..." lines
        const printers = stdout
          .split("\n")
          .filter((line) => line.includes("printer"))
          .map((line) => line.split(/\s+/)[1])
          .filter((name) => name && name.length > 0);
        return { printers };
      } else if (platform === "win32") {
        const result = await execFileAsync("powershell", [
          "-Command",
          "Get-Printer | Select-Object -ExpandProperty Name",
        ]);
        stdout = result.stdout;
        const printers = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        return { printers };
      }

      return { printers: [] };
    } catch (error) {
      this.logger.error("Error getting printers:", error);
      return { printers: [] };
    }
  }

  async printReceipt(
    receiptId: string,
    user: User,
    printerName?: string,
  ): Promise<{ success: boolean; message: string }> {
    let tempFilePath: string | null = null;

    try {
      const receipt = await this.findOne(receiptId, user);

      if (!receipt.pdf_path) {
        throw ApiErrors.FILE_NOT_FOUND(receiptId);
      }

      // Проверяем существование файла
      try {
        if (receipt.pdf_path.startsWith("object-storage://")) {
          const parsed = this.pdfStorageService.parseObjectStoragePath(
            receipt.pdf_path,
          );
          if (!parsed) {
            throw ApiErrors.VALIDATION_ERROR(
              "pdf_path",
              `Invalid object storage path: ${receipt.pdf_path}`,
            );
          }
          const exists = await this.pdfStorageService.fileExists(
            parsed.bucket,
            parsed.key,
          );
          if (!exists) {
            throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
          }
        } else {
          await fs.access(receipt.pdf_path);
        }
      } catch {
        throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
      }

      let filePathToPrint = receipt.pdf_path;

      if (receipt.pdf_path.startsWith("object-storage://")) {
        const parsed = this.pdfStorageService.parseObjectStoragePath(
          receipt.pdf_path,
        );
        if (!parsed) {
          throw ApiErrors.VALIDATION_ERROR(
            "pdf_path",
            `Invalid object storage path: ${receipt.pdf_path}`,
          );
        }

        const fileBuffer = await this.pdfStorageService.downloadFile(
          parsed.bucket,
          parsed.key,
        );
        tempFilePath = path.join(
          process.cwd(),
          "temp",
          `receipt-${receipt.number}-${Date.now()}.pdf`,
        );

        await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
        await fs.writeFile(tempFilePath, fileBuffer);
        filePathToPrint = tempFilePath;
      }

      // Validate printer name to prevent injection
      if (printerName && !SAFE_PRINTER_NAME.test(printerName)) {
        throw ApiErrors.VALIDATION_ERROR(
          "printer",
          "Invalid printer name. Only alphanumeric characters, hyphens, underscores, dots, and spaces are allowed.",
        );
      }

      const platform = process.platform;
      let cmd: string;
      let args: string[];

      if (platform === "darwin") {
        cmd = "lpr";
        args = printerName
          ? ["-P", printerName, filePathToPrint]
          : [filePathToPrint];
      } else if (platform === "linux") {
        cmd = "lp";
        args = printerName
          ? ["-d", printerName, filePathToPrint]
          : [filePathToPrint];
      } else if (platform === "win32") {
        cmd = "powershell";
        args = [
          "-Command",
          `Start-Process -FilePath '${filePathToPrint.replace(/'/g, "''")}' -Verb Print -WindowStyle Hidden`,
        ];
      } else {
        throw ApiErrors.BAD_REQUEST(
          `Unsupported operating system: ${platform}`,
        );
      }

      this.logger.log(
        `Printing receipt ${receipt.number} via ${cmd} ${args.join(" ")}`,
      );
      const { stderr } = await execFileAsync(cmd, args);

      if (stderr && !stderr.includes("warning")) {
        this.logger.error("Print command stderr:", stderr);
        throw ApiErrors.RECEIPT_PRINT_FAILED(receiptId);
      }

      this.logger.log(`Receipt ${receipt.number} sent to printer successfully`);
      return {
        success: true,
        message: `Чек ${receipt.number} отправлен на печать${printerName ? ` (принтер: ${printerName})` : ""}`,
      };
    } catch (error) {
      this.logger.error("Error printing receipt:", error);
      return {
        success: false,
        message: "Ошибка при печати чека. Попробуйте ещё раз.",
      };
    } finally {
      // Always clean up temp file, even on error
      if (tempFilePath) {
        fs.unlink(tempFilePath).catch((err) => {
          this.logger.warn(
            `Failed to delete temporary file ${tempFilePath}: ${err.message}`,
          );
        });
      }
    }
  }

  async generatePublicToken(
    receiptId: string,
    user: User,
  ): Promise<{ token: string; url: string }> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId, user_id: user.id },
    });

    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(receiptId);
    }

    if (receipt.status !== ReceiptStatus.GENERATED) {
      throw ApiErrors.BAD_REQUEST(
        "Only generated receipts can be shared publicly",
      );
    }

    const frontendUrl = this.configService.get<string>(
      "FRONTEND_URL",
      "http://localhost:5173",
    );

    // If already has a token, return it
    if (receipt.public_token) {
      return {
        token: receipt.public_token,
        url: `${frontendUrl}/r/${receipt.public_token}`,
      };
    }

    const token = crypto.randomBytes(32).toString("hex");

    const updated = await this.receiptsRepository.update(
      {
        id: receipt.id,
        user_id: user.id,
        status: ReceiptStatus.GENERATED,
        public_token: IsNull(),
      },
      { public_token: token },
    );
    if (updated.affected) return { token, url: `${frontendUrl}/r/${token}` };
    const current = await this.receiptsRepository.findOne({
      where: {
        id: receipt.id,
        user_id: user.id,
        status: ReceiptStatus.GENERATED,
      },
    });
    if (!current?.public_token)
      throw ApiErrors.BAD_REQUEST("Receipt changed while creating share link");
    return {
      token: current.public_token,
      url: `${frontendUrl}/r/${current.public_token}`,
    };
  }

  async revokePublicToken(receiptId: string, user: User): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId, user_id: user.id },
    });

    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(receiptId);
    }

    await this.receiptsRepository.update(
      { id: receiptId },
      { public_token: null },
    );

    this.logger.log(`Public token revoked for receipt ${receipt.number}`);

    return this.receiptsRepository.findOneOrFail({
      where: { id: receiptId },
    });
  }

  async getPublicReceipt(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw ApiErrors.NOT_FOUND("Receipt");
    return runWithPublicToken(token, () => this.findPublicReceipt(token));
  }

  private async findPublicReceipt(token: string) {
    const receipt = await this.receiptsRepository
      .createQueryBuilder("r")
      .addSelect("r.active_snapshot")
      .where("r.public_token=:token AND r.status=:status", {
        token,
        status: ReceiptStatus.GENERATED,
      })
      .getOne();
    if (!receipt) throw ApiErrors.NOT_FOUND("Receipt");
    const projection = receipt.active_snapshot?.publicProjection;
    return {
      receipt: {
        id: receipt.id,
        number: receipt.number,
        status: receipt.status,
        created_at: receipt.created_at,
        order: projection?.order || null,
      },
      companyInfo: projection?.companyInfo || {},
      formatting: projection?.formatting,
      documentLanguage: projection?.documentLanguage,
      money: projection?.money,
      metadataUnavailable: !projection,
    };
  }

  async getPublicReceiptPdf(
    token: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw ApiErrors.NOT_FOUND("Receipt");
    return runWithPublicToken(token, () => this.findPublicReceiptPdf(token));
  }

  private async findPublicReceiptPdf(
    token: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.receiptsRepository.findOne({
      where: { public_token: token, status: ReceiptStatus.GENERATED },
    });

    if (!receipt) {
      throw ApiErrors.NOT_FOUND("Receipt");
    }

    if (!receipt.pdf_path) {
      throw ApiErrors.FILE_NOT_FOUND("receipt PDF");
    }

    let buffer: Buffer;

    if (receipt.pdf_path.startsWith("object-storage://")) {
      const parsed = this.pdfStorageService.parseObjectStoragePath(
        receipt.pdf_path,
      );
      if (!parsed) {
        throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
      }
      const exists = await this.pdfStorageService.fileExists(
        parsed.bucket,
        parsed.key,
      );
      if (!exists) {
        throw ApiErrors.FILE_NOT_FOUND(receipt.pdf_path);
      }
      buffer = await this.pdfStorageService.downloadFile(
        parsed.bucket,
        parsed.key,
      );
    } else {
      await fs.access(receipt.pdf_path);
      buffer = await fs.readFile(receipt.pdf_path);
    }

    const filename = documentFilename(receipt);
    return { buffer, filename };
  }

  async deleteReceiptFilesForOrder(
    orderId: string,
    userId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Same tenant -> order -> receipts -> assets order as creation/promotion.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [userId],
      );
      await manager.findOne(Order, {
        where: { id: orderId, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      const receipts = await manager.find(Receipt, {
        where: { order_id: orderId, user_id: userId },
        select: [
          "id",
          "user_id",
          "pdf_path",
          "active_logo_asset_id",
          "pending_logo_asset_id",
        ],
      });
      const locked = await this.artifacts.lockRetirements(
        receipts,
        userId,
        manager,
        false,
      );
      for (const receipt of locked) {
        await this.artifacts.retire(receipt, manager);
        await manager.delete(Receipt, {
          id: receipt.id,
          user_id: receipt.user_id,
        });
      }
    });
  }
}
