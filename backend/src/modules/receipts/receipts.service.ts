import { pickSortColumn } from "../../common/utils/sort-column.util";
import { DocumentConfigService } from "../settings/services/document-config.service";
import {
  DocumentRenderService,
  sampleOrder,
} from "./services/document-render.service";
import { ConflictException } from "@nestjs/common";
import {
  ConfigSelection,
  DEFAULT_DOCUMENT_TIME_ZONE,
} from "../settings/document-config";
import { ReceiptSnapshotService } from "./services/receipt-snapshot.service";
import { ReceiptArtifactService } from "./services/receipt-artifact.service";
import { Injectable, Logger } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { isUniqueViolationOf } from "../../common/utils/unique-violation.util";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import {
  Brackets,
  Repository,
  DataSource,
  SelectQueryBuilder,
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
import { accountTimeZone } from "./account-time-zone";
import { SortOrder } from "../../common/dto/pagination.dto";
import { containsPattern } from "../../common/utils/like-pattern.util";
import {
  DEFAULT_DOCUMENT_PAGE_SIZE,
  DocumentListQuery,
} from "./dto/list-documents-query.dto";
import {
  GeneratableDocumentType,
  hasDocumentBlock,
  isGeneratableType,
  isMultiplePerOrder,
  isReissuableType,
  specFor,
} from "./document-types";
import {
  DocumentWarning,
  signoffUnavailableWarning,
} from "./document-warnings";
import type { DocumentDetailsInput, DocumentRequest } from "./frozen-document";
import { KeyedMutex } from "../../common/utils/keyed-mutex.util";
import {
  DrawnNumber,
  nextDocumentNumber,
  raiseCounterToIssued,
  releaseDocumentNumber,
} from "./receipt-number";
import {
  DOCUMENTS_RETAINED_PER_TYPE,
  isRetentionExempt,
} from "./document-retention";
import { isLockingDocumentType, syncOrderLock } from "./order-lock";
import {
  frozenReturnLines,
  releaseReturnNoteQuantities,
  findRecentIdenticalReturnNote,
  reserveReturnQuantities,
} from "./return-note-ledger";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { User } from "../users/entities/user.entity";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import { ConfigService } from "@nestjs/config";

import { ReceiptGenerationOutbox } from "./entities/receipt-generation-outbox.entity";
import { ReceiptOutboxService } from "./receipt-outbox.service";
import { runWithPublicToken } from "../../common/tenancy/tenant-context";

/**
 * A number ends in one digit run that is exactly its counter value (prefixes never end in
 * a digit), so the value is read back from the text: "9" sorts before "10", which the text
 * itself would not. At most 18 digits, so the cast cannot overflow a bigint on odd data.
 */
const NUMBER_COUNTER_VALUE = `CAST(substring(r.number from '[0-9]{1,18}$') AS bigint)`;

/** Allowlist for `sortBy` on the documents page; anything else sorts by date. */
const DOCUMENT_SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  created_at: "r.created_at",
  number: NUMBER_COUNTER_VALUE,
  document_type: "r.document_type",
  status: "r.status",
};

/** Recorded on documents voided because their order was cancelled. */
export const ORDER_CANCELLED_VOID_REASON = "order_cancelled";

/**
 * Column values that void a document: it stops being public (token revoked),
 * and any pending candidate or replacement is dropped so no delayed worker can
 * promote it. The active PDF and its frozen content stay as history.
 */
function voidedReceiptFields(reason: string | undefined, voidedAt: Date) {
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

/** The row as returned to the caller of an issuing call, with that call's warnings. */
function withWarnings(receipt: Receipt, warnings: DocumentWarning[]): Receipt {
  return warnings.length > 0
    ? Object.assign(new Receipt(), receipt, { warnings })
    : receipt;
}

/** The waybill route keeps its original error and wording whichever endpoint asks. */
function documentAlreadyExists(orderId: string, type: DocumentType) {
  return type === DocumentType.WAYBILL
    ? ApiErrors.RECEIPT_ALREADY_EXISTS(orderId)
    : ApiErrors.DOCUMENT_ALREADY_EXISTS(orderId, type);
}

const ORDER_TYPE_UNIQUE_INDEX = "IDX_receipts_order_document_type";
const NUMBER_UNIQUE_INDEX = "IDX_receipts_user_type_number";

const isNumberCollision = (error: unknown): boolean =>
  isUniqueViolationOf(error, NUMBER_UNIQUE_INDEX);

/**
 * A void of a type whose voided row keeps the slot closed (waybill, sales receipt, packing
 * list) is final for the order, so only an issued one may be voided: voiding one still
 * PROCESSING or FAILED would leave the order without that document forever. Reissuable
 * types and return notes (several per order) do not close a slot.
 */
function assertVoidable(receipt: Receipt): void {
  const type = receipt.document_type ?? DocumentType.WAYBILL;
  if (receipt.status === ReceiptStatus.GENERATED) return;
  if (isReissuableType(type) || isMultiplePerOrder(type)) return;
  throw ApiErrors.DOCUMENT_NOT_VOIDABLE(receipt.id, type, receipt.status);
}

/** A copy whose snapshot records that it was rebuilt from live data, not a frozen candidate. */
function markReconstructed<T extends { snapshot: object }>(prepared: T): T {
  return {
    ...prepared,
    snapshot: { ...prepared.snapshot, reconstructed: true },
  };
}

/** Thrown after the counter was repaired; the generation is run once more. */
class NumberCollisionRepaired extends Error {}

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

  constructor(
    @InjectRepository(Receipt)
    private receiptsRepository: Repository<Receipt>,
    private pdfStorageService: PdfStorageService,
    @InjectDataSource()
    private dataSource: DataSource,
    private configService: ConfigService,
    private receiptOutbox: ReceiptOutboxService,
    private readonly snapshots: ReceiptSnapshotService,
    private readonly artifacts: ReceiptArtifactService,
    private readonly documents: DocumentConfigService,
    private readonly renders: DocumentRenderService,
  ) {}

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
    const run = () =>
      this.runGenerationHealing(orderId, user, type, selection, details, file);
    // Two requests for the same order and type must not both draw a number: the late copies
    // would meet the first one's row (or its identical return note) only after drawing, and
    // only the highest drawn number can be handed back, so a double click left gaps in the
    // sequence (waybills and return notes did, as they were not serialized). The second
    // request waits, then returns the first one's result. In-process on purpose: a
    // lock-holding transaction around logo upload would pin a pooled connection per request.
    // Across processes the unique row index still allows one row; a rare loser may burn a number.
    return this.generationMutex.runExclusive(
      `${user.id}:${orderId}:${type}`,
      run,
    );
  }

  /** One automatic retry after the counter was found behind an existing number. */
  private async runGenerationHealing(
    orderId: string,
    user: User,
    type: GeneratableDocumentType,
    selection: ConfigSelection,
    details?: DocumentDetailsInput,
    file?: Express.Multer.File,
  ): Promise<Receipt> {
    try {
      return await this.runGeneration(
        orderId,
        user,
        type,
        selection,
        details,
        file,
      );
    } catch (error) {
      if (!(error instanceof NumberCollisionRepaired)) throw error;
    }
    try {
      return await this.runGeneration(
        orderId,
        user,
        type,
        selection,
        details,
        file,
      );
    } catch (error) {
      if (error instanceof NumberCollisionRepaired)
        throw new ConflictException(
          "Document numbering was out of sync and has been repaired. Try again.",
        );
      throw error;
    }
  }

  /** Raises the counter to the highest number issued so the next draw is free. */
  private async repairCounter(
    userId: string,
    type: DocumentType,
    year?: number,
  ): Promise<void> {
    try {
      await this.dataSource.transaction((manager) =>
        raiseCounterToIssued(manager, userId, type, year),
      );
    } catch (error) {
      this.logger.error(`Could not repair the ${type} counter: ${error}`);
    }
  }

  private async releaseDrawnNumber(
    userId: string,
    type: DocumentType,
    drawn: DrawnNumber | undefined,
  ): Promise<void> {
    if (!drawn) return;
    try {
      await releaseDocumentNumber(
        this.dataSource.manager,
        userId,
        type,
        drawn.value,
        drawn.year,
      );
    } catch (error) {
      // The original failure matters more; a leftover gap is harmless.
      this.logger.warn(
        `Could not release ${type} number ${drawn.number}: ${error}`,
      );
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
    // A double submit is answered before the quantity check, which the first request has
    // already used up; the same check runs again under the order lock for a true race.
    if (type === DocumentType.RETURN_NOTE && details?.lines) {
      const duplicate = await findRecentIdenticalReturnNote(
        this.dataSource.manager,
        user.id,
        orderId,
        { lines: details.lines, reason: details.reason },
      );
      if (duplicate) return duplicate;
    }
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
    // A retry of a FAILED document is the same document: it keeps the first attempt's buyer
    // and issue date (the number stays too, `allocateNumber`), so the date printed next to
    // the number never moves to the year of the retry.
    const frozenFirstAttempt = previous?.pending_snapshot?.document;
    const request: DocumentRequest | undefined = hasDocumentBlock(type)
      ? {
          type,
          details: details ?? {},
          carryOver: frozenFirstAttempt
            ? {
                buyer: frozenFirstAttempt.buyer,
                issueDate: frozenFirstAttempt.issueDate,
              }
            : undefined,
        }
      : undefined;
    // Every refusal that can be known without a number comes first, so it never burns one.
    if (request && !retryFrozen)
      await this.snapshots.preflight(user.id, orderId, selection, request);
    // A number drawn here but never committed is handed back below, so a late refusal
    // does not leave a gap in the sequence.
    let drawn: DrawnNumber | undefined;
    // The year in the number is the year in the document's time zone, so the number and the
    // date printed next to it agree. The zone comes from the resolved configuration, which
    // is why the draw happens inside `prepare`.
    const allocateNumber = async (
      timeZone: string = DEFAULT_DOCUMENT_TIME_ZONE,
      now?: Date,
    ) => {
      if (prior?.number) return prior.number;
      drawn = await nextDocumentNumber(this.dataSource.manager, user.id, type, {
        timeZone,
        now,
      });
      return drawn.number;
    };
    let receipt: Receipt;
    let bodyFinished = false;
    let issueWarnings: DocumentWarning[] = [];
    // An existing document returned unchanged (a double submit) was not built by this call,
    // so this call's warnings do not describe it.
    let isReturnedAsIs = false;
    try {
      // The number is drawn only after the logo is staged (bad file, quota, upload failure),
      // so those refusals never burn one.
      const freshlyPrepared = retryFrozen
        ? undefined
        : await this.snapshots.prepare(
            user.id,
            orderId,
            allocateNumber,
            selection,
            file,
            previous?.pending_snapshot?.order,
            request,
          );
      const prepared =
        freshlyPrepared && previous && !previous.pending_snapshot?.order
          ? markReconstructed(freshlyPrepared)
          : freshlyPrepared;
      issueWarnings = signoffUnavailableWarning(
        prepared?.signoffUnavailable ?? [],
      );
      const number = prepared?.number ?? (await allocateNumber());
      const generationBody = async (
        manager: EntityManager,
      ): Promise<Receipt> => {
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
        if (type === DocumentType.RETURN_NOTE) {
          const returnDetails = prepared?.snapshot.document?.details;
          const duplicate = await findRecentIdenticalReturnNote(
            manager,
            user.id,
            orderId,
            {
              lines: returnDetails?.returnLines ?? [],
              reason: returnDetails?.returnReason,
            },
          );
          if (duplicate) {
            isReturnedAsIs = true;
            return duplicate;
          }
          await reserveReturnQuantities(
            manager,
            user.id,
            orderId,
            returnDetails?.returnLines ?? [],
          );
        }
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
        ) {
          isReturnedAsIs = true;
          return existing;
        }
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
        // The candidate was built around `number`; the row keeps its own, so a row that
        // appeared since the number was chosen would print a number the document lacks.
        if (existing && existing.number !== number)
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
      };
      receipt = await this.dataSource.transaction(async (manager) => {
        const row = await generationBody(manager);
        // From here only COMMIT is left; if it fails we cannot tell whether it landed.
        bodyFinished = true;
        return row;
      });
    } catch (error) {
      if (isNumberCollision(error) && drawn) {
        // The counter is behind a number that already exists. Releasing would hand the same
        // value out again, so instead raise the counter above everything issued, once, and
        // let the caller retry with a fresh number.
        await this.repairCounter(user.id, type, drawn.year);
        throw new NumberCollisionRepaired();
      }
      // Released only when this number certainly never reached a committed document:
      // anything before the transaction, or a failure inside it (rolled back). A failed COMMIT
      // is ambiguous, and a gap is harmless where a reused number is not.
      if (!bodyFinished) await this.releaseDrawnNumber(user.id, type, drawn);
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
    if (drawn && receipt.number !== drawn.number)
      await this.releaseDrawnNumber(user.id, type, drawn);
    void this.receiptOutbox.dispatch();
    return isReturnedAsIs ? receipt : withWarnings(receipt, issueWarnings);
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

  async voidReceipt(id: string, user: User, reason?: string): Promise<Receipt> {
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
        throw ApiErrors.RECEIPT_IS_ALREADY_VOIDED(id);
      }
      assertVoidable(receipt);

      // The snapshot is read before the void clears the candidate that may hold it.
      // A failed note already gave its quantities back.
      const returnLines =
        receipt.document_type === DocumentType.RETURN_NOTE &&
        receipt.status !== ReceiptStatus.FAILED
          ? frozenReturnLines(
              await this.snapshots.internal(receipt.id, user.id, manager),
            )
          : undefined;

      // Void the receipt and revoke any public share link (immutable update)
      await manager.update(
        Receipt,
        { id: receipt.id, user_id: user.id },
        voidedReceiptFields(reason, new Date()),
      );
      // A voided return note gives its quantities back so the goods can be returned again.
      if (returnLines)
        await releaseReturnNoteQuantities(
          manager,
          this.logger,
          { id: receipt.id, order_id: receipt.order_id, user_id: user.id },
          returnLines,
          "voided",
        );
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

  /**
   * The documents page: filters, search and sorting over the account's receipts, each with
   * its order and the recipient's live name. Documents of soft-deleted orders are hidden.
   * Offset/limit are safe with these joins because both are to-one.
   */
  async findAll(
    user: User,
    query: DocumentListQuery = {},
  ): Promise<{
    data: Receipt[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? DEFAULT_DOCUMENT_PAGE_SIZE, 100);

    const qb = this.receiptsRepository
      .createQueryBuilder("r")
      // Soft-deleted orders are filtered explicitly below, so TypeORM must not add its
      // own condition to the join (which would turn them into `order: null` rows).
      .withDeleted()
      .leftJoin("r.order", "o", "o.user_id = r.user_id")
      .leftJoin("o.recipient", "rec")
      .addSelect(["o.id", "o.order_number", "o.status", "rec.id", "rec.name"])
      .where("r.user_id = :userId", { userId: user.id })
      .andWhere("o.deleted_at IS NULL");

    if (query.type)
      qb.andWhere("r.document_type = :type", { type: query.type });
    if (query.status)
      qb.andWhere("r.status = :status", { status: query.status });
    // Calendar days in the account's document time zone, both ends included. The bounds go
    // to the database as dates and the zone as a name, never as JS Dates, so the result does
    // not depend on the time zone of the server process. `created_at` holds UTC wall time.
    if (query.startDate || query.endDate) {
      const timeZone = await accountTimeZone(this.dataSource.manager, user.id);
      if (query.startDate)
        qb.andWhere(
          `r.created_at >= (CAST(CAST(:startDate AS date) AS timestamp) AT TIME ZONE :zone) AT TIME ZONE 'UTC'`,
          { startDate: query.startDate, zone: timeZone },
        );
      if (query.endDate)
        qb.andWhere(
          `r.created_at < (CAST(CAST(:endDate AS date) + 1 AS timestamp) AT TIME ZONE :zone) AT TIME ZONE 'UTC'`,
          { endDate: query.endDate, zone: timeZone },
        );
    }
    if (query.search) this.applyDocumentSearch(qb, query.search);

    const column = pickSortColumn(
      DOCUMENT_SORTABLE_COLUMNS,
      query.sortBy,
      "r.created_at",
    );
    const direction = query.sortOrder === SortOrder.ASC ? "ASC" : "DESC";
    if (column === NUMBER_COUNTER_VALUE) {
      // Numbers with the same value (other prefix or year) fall back to their text.
      qb.orderBy(column, direction, "NULLS LAST").addOrderBy(
        "r.number",
        direction,
      );
    } else {
      qb.orderBy(column, direction);
    }
    qb.addOrderBy("r.id", direction);

    const [data, total] = await qb
      .offset(offset)
      .limit(limit)
      .getManyAndCount();
    return { data, total, offset, limit };
  }

  private applyDocumentSearch(
    qb: SelectQueryBuilder<Receipt>,
    search: string,
  ): void {
    // "17" or "#17" finds order 17 as well as numbers and recipients containing 17.
    const orderNumber = /^#?(\d{1,9})$/.exec(search)?.[1];
    qb.andWhere(
      new Brackets((inner) => {
        inner
          .where("r.number ILIKE :pattern")
          .orWhere("rec.name ILIKE :pattern")
          .orWhere("rec.legal_name ILIKE :pattern");
        if (orderNumber) inner.orWhere("o.order_number = :orderNumber");
      }),
      {
        pattern: containsPattern(search),
        ...(orderNumber && { orderNumber: Number(orderNumber) }),
      },
    );
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
    if (count < DOCUMENTS_RETAINED_PER_TYPE || isRetentionExempt(type)) {
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
    const freshlyPrepared =
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
    const prepared =
      freshlyPrepared &&
      !original.active_snapshot?.order &&
      !original.pending_snapshot?.order
        ? markReconstructed(freshlyPrepared)
        : freshlyPrepared;
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
    return withWarnings(
      result,
      signoffUnavailableWarning(prepared?.signoffUnavailable ?? []),
    );
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

  async generatePublicToken(
    receiptId: string,
    user: User,
  ): Promise<{ token: string; url: string }> {
    const receipt = await this.findShareable(receiptId, user);

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

    // The order is checked again in the UPDATE itself: it may be deleted after the read above.
    const updated = await this.receiptsRepository
      .createQueryBuilder()
      .update(Receipt)
      .set({ public_token: token })
      .where({
        id: receipt.id,
        user_id: user.id,
        status: ReceiptStatus.GENERATED,
        public_token: IsNull(),
      })
      .andWhere(
        `EXISTS (SELECT 1 FROM "orders" "o" WHERE "o"."id" = "receipts"."order_id" AND "o"."deleted_at" IS NULL)`,
      )
      .execute();
    if (updated.affected) return { token, url: `${frontendUrl}/r/${token}` };
    // Lost a race: another share won (return its token), or the order was deleted or
    // the document voided meanwhile (the same 404/400 as if that had happened first).
    const current = await this.findShareable(receipt.id, user);
    if (!current.public_token) {
      throw ApiErrors.BAD_REQUEST("Receipt changed while creating share link");
    }
    return {
      token: current.public_token,
      url: `${frontendUrl}/r/${current.public_token}`,
    };
  }

  /**
   * A document of a deleted order is gone for the user, so it cannot get a public link.
   * The order is loaded rather than filtered with `order: { deleted_at: IsNull() }`: that
   * filter is a LEFT JOIN whose ON clause already drops a soft-deleted order, so the
   * missing row matched `deleted_at IS NULL` and a deleted order's document got through.
   */
  private async findShareable(receiptId: string, user: User): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId, user_id: user.id },
      relations: { order: true },
    });
    if (!receipt?.order) {
      throw ApiErrors.RECEIPT_NOT_FOUND(receiptId);
    }
    if (receipt.status !== ReceiptStatus.GENERATED) {
      throw ApiErrors.BAD_REQUEST(
        "Only generated receipts can be shared publicly",
      );
    }
    return receipt;
  }

  async revokePublicToken(receiptId: string, user: User): Promise<Receipt> {
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId, user_id: user.id },
    });

    if (!receipt) {
      throw ApiErrors.RECEIPT_NOT_FOUND(receiptId);
    }

    await this.receiptsRepository.update(
      { id: receiptId, user_id: user.id },
      { public_token: null },
    );

    this.logger.log(`Public token revoked for receipt ${receipt.number}`);

    return this.receiptsRepository.findOneOrFail({
      where: { id: receiptId, user_id: user.id },
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
        // The share page names the downloaded PDF and its heading after the type.
        document_type: receipt.document_type,
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

  /**
   * The same fixed 404 whatever is wrong with the stored file; the storage path (bucket,
   * key, user id) is internal and goes to the log only.
   */
  private pdfFileMissing(receipt: Pick<Receipt, "id" | "pdf_path">) {
    this.logger.warn(
      `PDF of receipt ${receipt.id} is not available at ${receipt.pdf_path}`,
    );
    return ApiErrors.FILE_NOT_FOUND("receipt PDF");
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
        throw this.pdfFileMissing(receipt);
      }
      const exists = await this.pdfStorageService.fileExists(
        parsed.bucket,
        parsed.key,
      );
      if (!exists) {
        throw this.pdfFileMissing(receipt);
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
}
