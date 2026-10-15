import { ConflictException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, IsNull, Not } from "typeorm";
import { createHash, randomUUID } from "crypto";
import { Receipt, ReceiptStatus } from "../entities/receipt.entity";
import { Order, OrderStatus } from "../../orders/entities/order.entity";
import { DocumentRenderService } from "./document-render.service";
import { DocumentArtifactsService } from "./document-artifacts.service";
import { ReceiptSnapshotService } from "./receipt-snapshot.service";

@Injectable()
export class ReceiptArtifactService {
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
        order.status !== OrderStatus.CONFIRMED ||
        (receipt.status === ReceiptStatus.GENERATED && !order.is_locked)
      )
        return null;
      await manager.findOne(Receipt, {
        where: { id, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      const current = await this.snapshots.lookup(id, userId, manager);
      if (!current) return null;
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
      if (current.status === ReceiptStatus.PROCESSING) {
        const total = await manager.count(Receipt, {
          where: { user_id: userId, status: ReceiptStatus.GENERATED },
        });
        if (total > 10) {
          const oldest = await manager.find(Receipt, {
            where: {
              user_id: userId,
              status: ReceiptStatus.GENERATED,
              id: Not(id),
            },
            select: [
              "id",
              "user_id",
              "pdf_path",
              "active_logo_asset_id",
              "pending_logo_asset_id",
            ],
            order: { created_at: "ASC", id: "ASC" },
            take: total - 10,
          });
          const locked = await this.lockRetirements(oldest, userId, manager);
          for (const old of locked) await this.retire(old, manager);
          for (const old of locked)
            await manager.delete(Receipt, {
              id: old.id,
              user_id: userId,
              status: ReceiptStatus.GENERATED,
            });
        }
      }
      await this.leases.retire(userId, current.pdf_path, manager);
      if (receipt.active_logo_asset_id !== receipt.pending_logo_asset_id)
        await this.snapshots.releaseLogo(
          userId,
          receipt.active_logo_asset_id,
          manager,
        );
      await manager.update(
        Order,
        { id: receipt.order_id, user_id: userId },
        { is_locked: true },
      );
      return manager.findOneOrFail(Receipt, { where: { id, user_id: userId } });
    });
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
    ) {
      const result = await this.db.manager.update(
        Receipt,
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
      return Boolean(result.affected);
    }
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
    const result = await this.db.manager.update(
      Receipt,
      {
        id,
        user_id: userId,
        generation_id: generationId,
        status: receipt.status,
        pending_id: receipt.pending_id,
      },
      change,
    );
    return Boolean(result.affected);
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
    const active = this.snapshots.active(receipt);
    const buffer = await this.renders.render(active.html, active.snapshot);
    const filename = `repair-${id}-${randomUUID()}.pdf`;
    const uploaded = await this.leases.upload(buffer, filename, userId);
    const repaired = await this.db.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: receipt.order_id, user_id: userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!order || order.status !== OrderStatus.CONFIRMED || !order.is_locked)
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
