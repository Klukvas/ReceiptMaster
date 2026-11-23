import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  IsNull,
  Not,
} from "typeorm";
import { createHash, randomUUID } from "crypto";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "../entities/receipt.entity";
import { updateReceiptOnFailure } from "../receipt-failure";
import { ApiErrors } from "../../../common/errors/ApiError";
import { readPlanLimits } from "../../subscription/plan-access";
import { retentionAction } from "../document-retention";
import { specFor } from "../document-types";
import { isLockingDocumentType, syncOrderLock } from "../order-lock";
import { Order } from "../../orders/entities/order.entity";
import { DocumentRenderService } from "./document-render.service";
import { DocumentArtifactsService } from "./document-artifacts.service";
import { ReceiptSnapshotService } from "./receipt-snapshot.service";

/** How many documents one promotion may retire; see `oldestOverCap`. */
const RETIRED_PER_PROMOTION = 1;
/** Oldest records looked at for a purge, so one that is being replaced can be skipped. */
const PURGE_CANDIDATES = 3;

@Injectable()
export class ReceiptArtifactService {
  private readonly logger = new Logger(ReceiptArtifactService.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly snapshots: ReceiptSnapshotService,
    private readonly renders: DocumentRenderService,
    private readonly leases: DocumentArtifactsService,
  ) {}
  async execute(
    id: string,
    userId: string,
    generationId: string,
    onEligible?: () => void,
  ): Promise<Receipt | null> {
    const receipt = await this.snapshots.lookup(id, userId);
    if (!receipt) return null;
    if (
      receipt.generation_id === generationId &&
      receipt.status === ReceiptStatus.PROCESSING &&
      !receipt.pending_id
    )
      throw new ConflictException(
        "Frozen candidate missing; explicit reconstruction required",
      );
    if (!this.matches(receipt, generationId)) return null;
    if (!receipt.pending_snapshot || !receipt.pending_html)
      throw new ConflictException(
        "Frozen candidate missing; explicit reconstruction required",
      );
    // Claim the observed candidate before emitting progress. A stale/deleted/voided job
    // loses without reviving a processing card. No asynchronous gap before the event.
    const claimed = await this.db.manager.update(
      Receipt,
      {
        id,
        user_id: userId,
        generation_id: generationId,
        pending_id: receipt.pending_id,
        active_revision: receipt.active_revision,
        status: receipt.status,
        ...(receipt.status === ReceiptStatus.GENERATED
          ? { replacement_status: "processing" as const }
          : {}),
      },
      {
        progress:
          receipt.status === ReceiptStatus.PROCESSING ? 40 : receipt.progress,
      },
    );
    if (!claimed.affected) return null;
    onEligible?.();
    const buffer = await this.renders.render(
      receipt.pending_html,
      receipt.pending_snapshot,
    );
    if (buffer.subarray(0, 4).toString() !== "%PDF")
      throw new Error("Renderer returned invalid PDF");
    const filename = `receipt-${id}-${generationId}-${randomUUID()}.pdf`;
    const uploaded = await this.leases.upload(buffer, filename, userId);
    return this.db.transaction(async (manager) => {
      // Same tenant lock/order as request preparation, before any order/asset locks.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [userId],
      );
      const order = await manager.findOne(Order, {
        where: { id: receipt.order_id, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !order ||
        !specFor(receipt.document_type).allowedOrderStatuses.includes(
          order.status,
        ) ||
        (receipt.status === ReceiptStatus.GENERATED &&
          isLockingDocumentType(receipt.document_type) &&
          !order.is_locked)
      )
        return null;
      await manager.findOne(Receipt, {
        where: { id, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      const current = await this.snapshots.lookup(id, userId, manager);
      if (!current) return null;
      // The plan's limit removed this record's file after the candidate was queued.
      if (current.content_purged_at) return null;
      if (
        !this.matches(current, generationId) ||
        current.pending_id !== receipt.pending_id ||
        current.active_revision !== receipt.pending_expected_revision
      )
        return null;
      await this.leases.attach(userId, uploaded.id, manager);
      const updated = await manager.update(
        Receipt,
        {
          id,
          user_id: userId,
          generation_id: generationId,
          pending_id: receipt.pending_id,
          active_revision: receipt.pending_expected_revision,
          status: receipt.status,
        },
        {
          pdf_path: uploaded.path,
          pdf_url: uploaded.url,
          hash: createHash("sha256").update(buffer).digest("hex"),
          html_snapshot: receipt.pending_html,
          active_snapshot: receipt.pending_snapshot,
          active_logo_asset_id: receipt.pending_logo_asset_id,
          active_revision: (receipt.active_revision || 0) + 1,
          template_id:
            receipt.pending_snapshot.config?.templateId || receipt.template_id,
          template_version: receipt.pending_snapshot.templateRevision,
          status: ReceiptStatus.GENERATED,
          progress: 100,
          error_message: null,
          replacement_status: null,
          replacement_error: null,
          pending_id: null,
          pending_snapshot: null,
          pending_html: null,
          pending_logo_asset_id: null,
          pending_expected_revision: null,
        },
      );
      if (!updated.affected) return null;
      // Retention is enforced here, at a successful first promotion, never when a row is
      // created: a generation that fails must not cost an older document its place.
      if (current.status === ReceiptStatus.PROCESSING) {
        await this.enforceRetention(manager, userId, current.document_type, id);
      }
      await this.leases.retire(userId, current.pdf_path, manager);
      if (receipt.active_logo_asset_id !== receipt.pending_logo_asset_id)
        await this.snapshots.releaseLogo(
          userId,
          receipt.active_logo_asset_id,
          manager,
        );
      if (isLockingDocumentType(current.document_type))
        await manager.update(
          Order,
          { id: receipt.order_id, user_id: userId },
          { is_locked: true },
        );
      return manager.findOneOrFail(Receipt, { where: { id, user_id: userId } });
    });
  }
  /** Applies the account plan's per-type document limit after a promotion. */
  private async enforceRetention(
    manager: EntityManager,
    userId: string,
    type: DocumentType,
    promotedId: string,
  ): Promise<void> {
    const { documentsRetainedPerType: cap } = await readPlanLimits(
      manager,
      userId,
    );
    if (cap === null) return;
    if (retentionAction(type) === "purge")
      await this.purgeOverCap(manager, userId, type, promotedId, cap);
    else await this.evictOverCap(manager, userId, type, promotedId, cap);
  }
  /**
   * The oldest generated documents of a type that are over the plan's cap, never the one
   * just promoted, and at most `RETIRED_PER_PROMOTION` of them. An account that is far over
   * the cap (it was downgraded, or the type had no cap before plans set one) therefore
   * stops growing instead of losing everything above the cap with its next document.
   */
  private async oldestOverCap(
    manager: EntityManager,
    where: FindOptionsWhere<Receipt>,
    promotedId: string,
    cap: number,
    candidates = RETIRED_PER_PROMOTION,
  ): Promise<Receipt[]> {
    const total = await manager.count(Receipt, { where });
    if (total <= cap) return [];
    return manager.find(Receipt, {
      where: { ...where, id: Not(promotedId) },
      select: [
        "id",
        "user_id",
        "order_id",
        "pdf_path",
        "active_logo_asset_id",
        "pending_logo_asset_id",
      ],
      order: { created_at: "ASC", id: "ASC" },
      take: Math.min(total - cap, candidates),
    });
  }
  /**
   * For the types whose row must stay: the oldest document over the cap loses its file,
   * frozen HTML, logo and public link and is marked, so the limit counts only records that
   * still have content. The row keeps its number, its order slot and the snapshot a return
   * note's quantities are read from.
   */
  async purgeOverCap(
    manager: EntityManager,
    userId: string,
    type: DocumentType,
    promotedId: string,
    cap: number,
  ): Promise<void> {
    const candidates = await this.oldestOverCap(
      manager,
      {
        user_id: userId,
        status: ReceiptStatus.GENERATED,
        document_type: type,
        content_purged_at: IsNull(),
      },
      promotedId,
      cap,
      PURGE_CANDIDATES,
    );
    for (const candidate of candidates) {
      const row = await manager.findOne(Receipt, {
        where: {
          id: candidate.id,
          user_id: userId,
          status: ReceiptStatus.GENERATED,
          content_purged_at: IsNull(),
        },
        select: [
          "id",
          "user_id",
          "pdf_path",
          "replacement_status",
          "active_logo_asset_id",
          "pending_logo_asset_id",
        ],
        lock: { mode: "pessimistic_write" },
      });
      // A replacement being rendered would write a fresh file onto the purged record; that
      // document waits for a later promotion and the next oldest is taken instead.
      if (!row || row.replacement_status === "processing") continue;
      await this.retire(row, manager);
      await manager.update(
        Receipt,
        { id: row.id, user_id: userId, status: ReceiptStatus.GENERATED },
        {
          content_purged_at: new Date(),
          pdf_path: null,
          pdf_url: null,
          public_token: null,
          html_snapshot: null,
          active_logo_asset_id: null,
          replacement_status: null,
          replacement_error: null,
          pending_id: null,
          pending_snapshot: null,
          pending_html: null,
          pending_logo_asset_id: null,
          pending_expected_revision: null,
        },
      );
      return;
    }
  }
  /**
   * For the types whose row may go: the oldest generated document over the cap is retired
   * and deleted, rows locked in a stable order before any PDF or logo lease.
   */
  async evictOverCap(
    manager: EntityManager,
    userId: string,
    type: DocumentType,
    promotedId: string,
    cap: number,
  ): Promise<void> {
    const oldest = await this.oldestOverCap(
      manager,
      {
        user_id: userId,
        status: ReceiptStatus.GENERATED,
        document_type: type,
      },
      promotedId,
      cap,
    );
    if (oldest.length === 0) return;
    // An evicted locking document may have been the last one holding its order locked.
    // The orders are locked first, in id order and before any receipt of theirs, so the
    // lock-flag recount below sees a stable set of documents.
    const orderIds = isLockingDocumentType(type)
      ? [...new Set(oldest.map((row) => row.order_id))].sort()
      : [];
    for (const orderId of orderIds)
      await manager.findOne(Order, {
        where: { id: orderId, user_id: userId },
        select: ["id"],
        lock: { mode: "pessimistic_write" },
      });
    const locked = await this.lockRetirements(oldest, userId, manager);
    for (const old of locked) await this.retire(old, manager);
    for (const old of locked)
      await manager.delete(Receipt, {
        id: old.id,
        user_id: userId,
        status: ReceiptStatus.GENERATED,
      });
    for (const orderId of orderIds)
      await syncOrderLock(manager, orderId, userId);
  }

  private matches(receipt: Receipt, generationId: string): boolean {
    return (
      receipt.generation_id === generationId &&
      Boolean(receipt.pending_id) &&
      (receipt.status === ReceiptStatus.PROCESSING ||
        (receipt.status === ReceiptStatus.GENERATED &&
          receipt.replacement_status === "processing"))
    );
  }
  async failed(
    id: string,
    userId: string,
    generationId: string,
  ): Promise<boolean> {
    const receipt = await this.snapshots.lookup(id, userId);
    if (!receipt) return false;
    if (
      receipt.generation_id === generationId &&
      receipt.status === ReceiptStatus.PROCESSING &&
      !receipt.pending_id
    )
      return updateReceiptOnFailure(
        this.db,
        this.logger,
        receipt,
        {
          id,
          user_id: userId,
          generation_id: generationId,
          status: ReceiptStatus.PROCESSING,
        },
        {
          status: ReceiptStatus.FAILED,
          error_message:
            "Frozen candidate missing. Explicit reconstruction is required.",
        },
      );
    if (!this.matches(receipt, generationId)) return false;
    const change =
      receipt.status === ReceiptStatus.GENERATED
        ? {
            replacement_status: "failed" as const,
            replacement_error:
              "Replacement failed. The current PDF remains available; retry reproduces the frozen candidate.",
          }
        : {
            status: ReceiptStatus.FAILED,
            error_message:
              "Generation failed. Retry uses the frozen candidate.",
          };
    return updateReceiptOnFailure(
      this.db,
      this.logger,
      receipt,
      {
        id,
        user_id: userId,
        generation_id: generationId,
        status: receipt.status,
        pending_id: receipt.pending_id,
      },
      change,
    );
  }
  /** Select oldest eligible candidates first, then lock/refetch all IDs in stable order
   * before touching any lease/logo. Never retire a pre-lock pointer after repair. */
  async lockRetirements(
    selected: Receipt[],
    userId: string,
    manager: import("typeorm").EntityManager,
    generatedOnly = true,
  ): Promise<Receipt[]> {
    const locked: Receipt[] = [];
    for (const id of [...new Set(selected.map((row) => row.id))].sort()) {
      const row = await manager.findOne(Receipt, {
        where: {
          id,
          user_id: userId,
          ...(generatedOnly ? { status: ReceiptStatus.GENERATED } : {}),
        },
        select: [
          "id",
          "user_id",
          "pdf_path",
          "active_logo_asset_id",
          "pending_logo_asset_id",
        ],
        lock: { mode: "pessimistic_write" },
      });
      if (row) locked.push(row);
    }
    return locked;
  }
  /** Call only with rows returned by lockRetirements in this transaction. */
  async retire(
    receipt: Receipt,
    manager: import("typeorm").EntityManager,
  ): Promise<void> {
    await this.leases.retire(receipt.user_id, receipt.pdf_path, manager);
    await this.snapshots.releaseLogo(
      receipt.user_id,
      receipt.active_logo_asset_id,
      manager,
    );
    await this.snapshots.releaseLogo(
      receipt.user_id,
      receipt.pending_logo_asset_id,
      manager,
    );
  }
  async repair(id: string, userId: string): Promise<Buffer> {
    const receipt = await this.snapshots.internal(id, userId);
    if (receipt.status !== ReceiptStatus.GENERATED)
      throw new ConflictException("Only an active document can be repaired");
    // A purged record has no file on purpose; re-rendering it would undo the limit.
    if (receipt.content_purged_at) throw ApiErrors.DOCUMENT_CONTENT_PURGED(id);
    const active = this.snapshots.active(receipt);
    const buffer = await this.renders.render(active.html, active.snapshot);
    const filename = `repair-${id}-${randomUUID()}.pdf`;
    const uploaded = await this.leases.upload(buffer, filename, userId);
    const repaired = await this.db.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: receipt.order_id, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !order ||
        !specFor(receipt.document_type).allowedOrderStatuses.includes(
          order.status,
        ) ||
        (isLockingDocumentType(receipt.document_type) && !order.is_locked)
      )
        return false;
      // Receipt before either new or retired lease, matching eviction/promotion.
      await manager.findOne(Receipt, {
        where: { id, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      await this.leases.attach(userId, uploaded.id, manager);
      const result = await manager.update(
        Receipt,
        {
          id,
          user_id: userId,
          status: ReceiptStatus.GENERATED,
          active_revision: receipt.active_revision || 0,
          hash: receipt.hash ?? IsNull(),
          pdf_path: receipt.pdf_path ?? IsNull(),
        },
        {
          pdf_url: uploaded.url,
          pdf_path: uploaded.path,
          hash: createHash("sha256").update(buffer).digest("hex"),
        },
      );
      if (!result.affected) return false;
      await this.leases.retire(userId, receipt.pdf_path, manager);
      return true;
    });
    if (!repaired)
      throw new ConflictException("Document changed during repair");
    return buffer;
  }
}
