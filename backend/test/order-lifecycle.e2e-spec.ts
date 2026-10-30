import "reflect-metadata";
import { createHash, randomBytes, randomUUID } from "crypto";
import { ConflictException } from "@nestjs/common";
import { Job } from "bullmq";
import { QueryRunner } from "typeorm";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { CacheService } from "../src/common/services/cache.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import {
  Order,
  OrderStatus,
} from "../src/modules/orders/entities/order.entity";
import { OrderItem } from "../src/modules/orders/entities/order-item.entity";
import { IdempotencyKey } from "../src/modules/orders/entities/idempotency-key.entity";
import {
  Currency,
  Product,
} from "../src/modules/products/entities/product.entity";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
import { User } from "../src/modules/users/entities/user.entity";
import { SubscriptionService } from "../src/modules/subscription/subscription.service";
import { UserSubscription } from "../src/modules/subscription/entities/user-subscription.entity";
import { SettingsService } from "../src/modules/settings/services/settings.service";
import { DocumentAssetsService } from "../src/modules/settings/services/document-assets.service";
import { DocumentAsset } from "../src/modules/settings/entities/document-asset.entity";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import {
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { ReceiptGenerationOutbox } from "../src/modules/receipts/entities/receipt-generation-outbox.entity";
import { ReceiptOutboxService } from "../src/modules/receipts/receipt-outbox.service";
import {
  ReceiptGenerationJobData,
  ReceiptGenerationProcessor,
} from "../src/modules/receipts/receipt-generation.processor";
import { ReceiptArtifactService } from "../src/modules/receipts/services/receipt-artifact.service";
import {
  PRIVATE_RECEIPT_COLUMNS,
  ReceiptSnapshotService,
} from "../src/modules/receipts/services/receipt-snapshot.service";
import {
  DocumentRenderService,
  RenderSnapshot,
} from "../src/modules/receipts/services/document-render.service";
import { DocumentArtifactsService } from "../src/modules/receipts/services/document-artifacts.service";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { RestrictedAppDatabase } from "./helpers/restricted-app-database";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";

const FIXTURE_PDF = Buffer.from("%PDF-1.4 lifecycle fixture");
const DAY_MS = 24 * 60 * 60 * 1000;

/** A promise pair that lets a test hold an operation at a known point. */
function barrier() {
  let reach: () => void = () => undefined;
  let release: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { reached, released, reach, release };
}

// Real order and receipt services as a restricted role on a fully migrated
// database, through the production tenant query context. Only Chromium, object
// storage, the queue and the socket gateway are doubles.
describeIsolatedPostgres(
  "order lifecycle: cancel, confirm and delayed workers on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let orders: OrdersService;
    let receipts: ReceiptsService;
    let artifacts: ReceiptArtifactService;
    let user: User;
    let recipient: Recipient;
    let renderHold: ReturnType<typeof barrier> | null = null;
    const published: string[] = [];

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_lifecycle");
      const { app } = db;
      const subscription = new SubscriptionService(
        app.getRepository(UserSubscription),
        app.getRepository(Product),
        app.getRepository(Order),
        app,
      );
      const renderer = {
        generatePdf: async () => {
          const hold = renderHold;
          if (hold) {
            hold.reach();
            await hold.released;
          }
          return FIXTURE_PDF;
        },
      };
      const storage = {
        uploadReceipt: async (_buffer: Buffer, filename: string) =>
          `https://storage.example.test/${filename}`,
        parseObjectStoragePath: (path: string) => ({
          bucket: "receipts",
          key: path.replace("object-storage://", ""),
        }),
        fileExists: async () => true,
      };
      const renders = new DocumentRenderService(
        undefined,
        renderer as never,
        undefined,
      );
      const assets = new DocumentAssetsService(app, undefined);
      const snapshots = new ReceiptSnapshotService(
        app,
        undefined,
        assets,
        renders,
      );
      artifacts = new ReceiptArtifactService(
        app,
        snapshots,
        renders,
        new DocumentArtifactsService(app, storage as never),
      );
      receipts = new ReceiptsService(
        app.getRepository(Receipt),
        app.getRepository(Order),
        undefined,
        storage as never,
        app,
        { get: () => "https://example.test" } as never,
        undefined,
        { dispatch: async () => undefined } as never,
        snapshots,
        artifacts,
      );
      orders = new OrdersService(
        app.getRepository(Order),
        app.getRepository(OrderItem),
        app.getRepository(IdempotencyKey),
        app.getRepository(Product),
        app.getRepository(Recipient),
        app,
        receipts,
        { delByPattern: async () => undefined } as unknown as CacheService,
        subscription,
        {
          getAutoGenerateReceipt: async () => false,
        } as unknown as SettingsService,
      );
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      renderHold = null;
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@lifecycle.invalid`,
        password: "fixture",
      });
      recipient = await db.admin
        .getRepository(Recipient)
        .save({ name: "Lifecycle recipient", user_id: user.id });
    });

    const asTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      runWithTenant(user.id, operation);

    const seedProduct = () =>
      db.admin.getRepository(Product).save(
        db.admin.getRepository(Product).create({
          name: randomUUID(),
          user_id: user.id,
          purchase_price_cents: 100,
          sale_price_cents: 500,
          quantity: 10,
          currency: Currency.UAH,
        }),
      );

    const stock = async (product: Product) =>
      (
        await db.admin
          .getRepository(Product)
          .findOneOrFail({ where: { id: product.id }, withDeleted: true })
      ).quantity;

    const draft = async (product: Product): Promise<Order> =>
      (
        await asTenant(() =>
          orders.create(
            {
              recipientId: recipient.id,
              items: [{ productId: product.id, qty: 2 }],
            },
            user,
          ),
        )
      ).data as Order;

    const confirmed = async (product: Product): Promise<Order> => {
      const order = await draft(product);
      return asTenant(() => orders.confirm(order.id, user));
    };

    const orderStatus = async (id: string) =>
      (
        await db.admin
          .getRepository(Order)
          .findOneOrFail({ where: { id }, withDeleted: true })
      ).status;

    const storedReceipt = (id: string) =>
      db.admin
        .getRepository(Receipt)
        .createQueryBuilder("r")
        .addSelect(PRIVATE_RECEIPT_COLUMNS.map((column) => `r.${column}`))
        .where("r.id = :id", { id })
        .getOneOrFail();

    const seedLogo = (leaseExpiresAt: Date) => {
      const id = randomUUID();
      return db.admin.getRepository(DocumentAsset).save({
        id,
        user_id: user.id,
        object_key: `logos/${user.id}/${id}.png`,
        sha256: "a".repeat(64),
        bytes: 1,
        width: 1,
        height: 1,
        state: "ready" as const,
        lease_expires_at: leaseExpiresAt,
      });
    };

    const frozen = (label: string) => {
      const html = `<!doctype html><html><body>${label}</body></html>`;
      const snapshot = {
        templateRevision: 1,
        options: {},
        htmlHash: createHash("sha256").update(html).digest("hex"),
      } as unknown as RenderSnapshot;
      return { html, snapshot };
    };

    /** The state a finished generation leaves: active PDF, share link, locked order. */
    const generatedReceipt = async (
      order: Order,
      extra: Partial<Receipt> = {},
    ): Promise<Receipt> => {
      const active = frozen("Active document");
      const receipt = await db.admin.getRepository(Receipt).save({
        user_id: user.id,
        order_id: order.id,
        number: randomUUID().slice(0, 20),
        status: ReceiptStatus.GENERATED,
        public_token: randomBytes(32).toString("hex"),
        html_snapshot: active.html,
        active_snapshot: active.snapshot,
        active_revision: 1,
        pdf_path: `object-storage://receipts/${user.id}/active.pdf`,
        pdf_url: "https://storage.example.test/active.pdf",
        hash: "active",
        progress: 100,
        ...extra,
      });
      await db.admin
        .getRepository(Order)
        .update({ id: order.id }, { is_locked: true });
      return receipt;
    };

    /** The state a committed generation request leaves: candidate plus outbox entry. */
    const processingReceipt = async (
      order: Order,
      manager = db.admin.manager,
    ): Promise<{ receipt: Receipt; generationId: string }> => {
      const candidate = frozen("Pending candidate");
      const generationId = randomUUID();
      const receipt = await manager.getRepository(Receipt).save({
        user_id: user.id,
        order_id: order.id,
        number: randomUUID().slice(0, 20),
        status: ReceiptStatus.PROCESSING,
        active_revision: 0,
        progress: 0,
        generation_id: generationId,
        generation_started_at: new Date(),
        pending_id: randomUUID(),
        pending_html: candidate.html,
        pending_snapshot: candidate.snapshot,
        pending_expected_revision: 0,
      });
      await manager.getRepository(ReceiptGenerationOutbox).save({
        id: randomUUID(),
        receipt_id: receipt.id,
        order_id: order.id,
        user_id: user.id,
        generation_id: generationId,
        published_at: null,
      });
      return { receipt, generationId };
    };

    const openBlocker = async (): Promise<QueryRunner> => {
      const blocker = db.admin.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      return blocker;
    };

    /**
     * Holds the order row, starts `first` and waits until it is parked on a lock,
     * then starts `second` and waits for both, then lets them run in that order.
     */
    const contend = async <A, B>(
      orderId: string,
      first: () => Promise<A>,
      second: () => Promise<B>,
    ): Promise<[PromiseSettledResult<A>, PromiseSettledResult<B>]> => {
      const blocker = await openBlocker();
      try {
        await blocker.query("SELECT id FROM orders WHERE id = $1 FOR UPDATE", [
          orderId,
        ]);
        const a = first();
        a.catch(() => undefined);
        expect(await db.waitForLockWaiters(1)).toBeGreaterThanOrEqual(1);
        const b = second();
        b.catch(() => undefined);
        expect(await db.waitForLockWaiters(2)).toBeGreaterThanOrEqual(2);
        await blocker.commitTransaction();
        return (await Promise.allSettled([a, b])) as [
          PromiseSettledResult<A>,
          PromiseSettledResult<B>,
        ];
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        await blocker.release();
      }
    };

    const cancel = (id: string) => asTenant(() => orders.cancel(id, user));

    describe("transitions are decided under the order lock", () => {
      it("a confirm parked behind a cancel cannot resurrect the order", async () => {
        const order = await draft(await seedProduct());

        const [cancelled, confirm] = await contend(
          order.id,
          () => cancel(order.id),
          () => asTenant(() => orders.confirm(order.id, user)),
        );

        expect(cancelled.status).toBe("fulfilled");
        expect(confirm).toMatchObject({
          status: "rejected",
          reason: { errorCode: "ORDER_CANNOT_BE_MODIFIED" },
        });
        expect(await orderStatus(order.id)).toBe(OrderStatus.CANCELLED);
      });

      it("a cancel parked behind a confirm cancels the confirmed order", async () => {
        const order = await draft(await seedProduct());

        const [confirm, cancelled] = await contend(
          order.id,
          () => asTenant(() => orders.confirm(order.id, user)),
          () => cancel(order.id),
        );

        expect(confirm.status).toBe("fulfilled");
        expect(cancelled.status).toBe("fulfilled");
        expect(await orderStatus(order.id)).toBe(OrderStatus.CANCELLED);
      });

      it("a batch approval parked behind a cancel cannot resurrect the order", async () => {
        const order = await draft(await seedProduct());

        const [cancelled, approve] = await contend(
          order.id,
          () => cancel(order.id),
          () => asTenant(() => orders.approveBatch([order.id], user)),
        );

        expect(cancelled.status).toBe("fulfilled");
        expect(approve).toMatchObject({
          status: "rejected",
          reason: { errorCode: "BATCH_ORDERS_NOT_ALL_DRAFT" },
        });
        expect(await orderStatus(order.id)).toBe(OrderStatus.CANCELLED);
      });

      it("of two concurrent cancels exactly one wins", async () => {
        const order = await confirmed(await seedProduct());

        const results = await Promise.allSettled([
          cancel(order.id),
          cancel(order.id),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(results.find((r) => r.status === "rejected")).toMatchObject({
          reason: { statusCode: 400, errorCode: "ORDER_ALREADY_CANCELLED" },
        });
        await expect(cancel(order.id)).rejects.toMatchObject({
          errorCode: "ORDER_ALREADY_CANCELLED",
        });
      });

      it("cancelling a draft keeps its stock reserved until the order is deleted", async () => {
        const product = await seedProduct();
        const order = await draft(product);

        const result = await cancel(order.id);

        expect(result).toMatchObject({
          id: order.id,
          status: OrderStatus.CANCELLED,
          receipts: [],
        });
        expect(await stock(product)).toBe(8);
        await asTenant(() => orders.remove(order.id, user));
        expect(await stock(product)).toBe(10);
      });
    });

    describe("cancelling a confirmed order voids its documents", () => {
      it("voids the active document and pending candidate, revokes the link, keeps the PDF and stock", async () => {
        const product = await seedProduct();
        const order = await confirmed(product);
        const activeLogo = await seedLogo(new Date(Date.now() - DAY_MS));
        const pendingLogo = await seedLogo(new Date(Date.now() - DAY_MS));
        const candidate = frozen("Replacement candidate");
        const receipt = await generatedReceipt(order, {
          replacement_status: "processing",
          generation_id: randomUUID(),
          pending_id: randomUUID(),
          pending_html: candidate.html,
          pending_snapshot: candidate.snapshot,
          pending_expected_revision: 1,
          active_logo_asset_id: activeLogo.id,
          pending_logo_asset_id: pendingLogo.id,
        });
        expect(await stock(product)).toBe(8);

        const result = await cancel(order.id);

        expect(result.status).toBe(OrderStatus.CANCELLED);
        expect(result.receipts).toEqual([
          expect.objectContaining({
            id: receipt.id,
            status: ReceiptStatus.VOID,
          }),
        ]);
        const stored = await storedReceipt(receipt.id);
        expect(stored).toMatchObject({
          status: ReceiptStatus.VOID,
          void_reason: "order_cancelled",
          public_token: null,
          replacement_status: null,
          replacement_error: null,
          pending_id: null,
          pending_html: null,
          pending_snapshot: null,
          pending_expected_revision: null,
          pending_logo_asset_id: null,
          // History stays: the active PDF, its frozen content and logo.
          pdf_path: receipt.pdf_path,
          html_snapshot: receipt.html_snapshot,
          active_revision: 1,
          active_logo_asset_id: activeLogo.id,
        });
        expect(stored.voided_at).toBeInstanceOf(Date);
        // The dropped candidate's logo starts its cleanup grace; the active one does not.
        const leases = await db.admin
          .getRepository(DocumentAsset)
          .findBy([{ id: activeLogo.id }, { id: pendingLogo.id }]);
        const lease = (id: string) =>
          leases.find((asset) => asset.id === id)?.lease_expires_at.getTime() ??
          0;
        expect(lease(pendingLogo.id)).toBeGreaterThan(Date.now());
        expect(lease(activeLogo.id)).toBeLessThan(Date.now());
        // The order is not reopened for editing.
        expect(
          (
            await db.admin
              .getRepository(Order)
              .findOneByOrFail({ id: order.id })
          ).is_locked,
        ).toBe(true);
        // The share link is dead for metadata and PDF.
        await expect(
          receipts.getPublicReceipt(receipt.public_token as string),
        ).rejects.toMatchObject({ statusCode: 404 });
        await expect(
          receipts.getPublicReceiptPdf(receipt.public_token as string),
        ).rejects.toMatchObject({ statusCode: 404 });
        // Cancelling returns no stock; deleting returns it exactly once.
        expect(await stock(product)).toBe(8);
        const deletes = await Promise.allSettled([
          asTenant(() => orders.remove(order.id, user)),
          asTenant(() => orders.remove(order.id, user)),
        ]);
        expect(deletes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(await stock(product)).toBe(10);
        await expect(
          asTenant(() => orders.remove(order.id, user)),
        ).rejects.toMatchObject({ errorCode: "ORDER_NOT_FOUND" });
        expect(await stock(product)).toBe(10);
      });

      it("keeps a document that was voided by hand, with its own reason", async () => {
        const order = await confirmed(await seedProduct());
        const receipt = await generatedReceipt(order);
        await asTenant(() =>
          receipts.voidReceipt(receipt.id, user, "Customer refund"),
        );
        const before = await storedReceipt(receipt.id);

        await cancel(order.id);

        const after = await storedReceipt(receipt.id);
        expect(after).toMatchObject({
          status: ReceiptStatus.VOID,
          void_reason: "Customer refund",
          pdf_path: receipt.pdf_path,
        });
        expect(after.voided_at).toEqual(before.voided_at);
      });

      it("a generation that committed first is voided by the cancel waiting on the tenant lock", async () => {
        const order = await confirmed(await seedProduct());
        const blocker = await openBlocker();
        let pending: Promise<Order> | undefined;
        let created: Receipt;
        try {
          // What the generation request does: tenant lock, then candidate + outbox.
          await blocker.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
            [user.id],
          );
          ({ receipt: created } = await processingReceipt(
            order,
            blocker.manager,
          ));
          pending = cancel(order.id);
          pending.catch(() => undefined);
          expect(await db.waitForLockWaiters(1)).toBeGreaterThanOrEqual(1);
          await blocker.commitTransaction();
        } finally {
          if (blocker.isTransactionActive) await blocker.rollbackTransaction();
          await blocker.release();
        }

        await expect(pending).resolves.toMatchObject({
          status: OrderStatus.CANCELLED,
        });
        expect(await storedReceipt(created.id)).toMatchObject({
          status: ReceiptStatus.VOID,
          void_reason: "order_cancelled",
          pending_id: null,
        });
      });
    });

    describe("delayed workers after a cancel", () => {
      const gateway = () => ({
        emitProgress: jest.fn(),
        emitCompleted: jest.fn(),
        emitFailed: jest.fn(),
      });

      const job = (
        receipt: Receipt,
        generationId: string,
      ): Job<ReceiptGenerationJobData> =>
        ({
          data: {
            receiptId: receipt.id,
            orderId: receipt.order_id,
            userId: user.id,
            generationId,
          },
          attemptsMade: 3,
          opts: { attempts: 3 },
        }) as unknown as Job<ReceiptGenerationJobData>;

      it("a job that starts after the cancel does nothing and the outbox drops it", async () => {
        const order = await confirmed(await seedProduct());
        const { receipt, generationId } = await processingReceipt(order);

        await cancel(order.id);

        const events = gateway();
        const processor = new ReceiptGenerationProcessor(
          artifacts,
          events as never,
        );
        await processor.process(job(receipt, generationId));
        expect(events.emitProgress).not.toHaveBeenCalled();
        expect(events.emitCompleted).not.toHaveBeenCalled();
        // The exhausted-failure callback cannot turn the void into FAILED.
        await processor.onFailed(job(receipt, generationId), new Error("x"));
        expect(events.emitFailed).not.toHaveBeenCalled();
        expect(
          await asTenant(() =>
            artifacts.failed(receipt.id, user.id, generationId),
          ),
        ).toBe(false);

        const publisher = () => ({
          queue: {
            getJob: async () => null,
            add: async (_name: string, data: ReceiptGenerationJobData) => {
              published.push(data.receiptId);
            },
          },
          close: () => undefined,
        });
        const outbox = new ReceiptOutboxService(db.app, publisher as never);
        await outbox.dispatch();
        expect(published).not.toContain(receipt.id);
        expect(
          await db.admin
            .getRepository(ReceiptGenerationOutbox)
            .countBy({ receipt_id: receipt.id }),
        ).toBe(0);
        expect(await storedReceipt(receipt.id)).toMatchObject({
          status: ReceiptStatus.VOID,
          pdf_path: null,
        });
      });

      it("a render in flight during the cancel cannot promote, and emits no completion", async () => {
        const order = await confirmed(await seedProduct());
        const { receipt, generationId } = await processingReceipt(order);
        renderHold = barrier();
        const events = gateway();
        const processor = new ReceiptGenerationProcessor(
          artifacts,
          events as never,
        );

        const running = processor.process(job(receipt, generationId));
        running.catch(() => undefined);
        await Promise.race([
          renderHold.reached,
          running.then(() => {
            throw new Error("job finished before rendering");
          }),
        ]);
        expect(events.emitProgress).toHaveBeenCalledTimes(1);
        await cancel(order.id);
        renderHold.release();
        await running;

        expect(events.emitCompleted).not.toHaveBeenCalled();
        expect(await storedReceipt(receipt.id)).toMatchObject({
          status: ReceiptStatus.VOID,
          void_reason: "order_cancelled",
          pdf_path: null,
          pending_id: null,
          active_revision: 0,
        });
        expect(await orderStatus(order.id)).toBe(OrderStatus.CANCELLED);
      });
    });

    describe("after a cancel nothing reopens the document or the order", () => {
      it("rejects generate, share, regenerate, repair, void, confirm and edit", async () => {
        const product = await seedProduct();
        const order = await confirmed(product);
        const receipt = await generatedReceipt(order);
        const unprinted = await confirmed(product);
        await cancel(order.id);
        await cancel(unprinted.id);

        await expect(
          asTenant(() => receipts.generateReceipt(order.id, user)),
        ).rejects.toMatchObject({ errorCode: "RECEIPT_ALREADY_EXISTS" });
        await expect(
          asTenant(() => receipts.generateReceipt(unprinted.id, user)),
        ).rejects.toMatchObject({
          statusCode: 400,
          errorCode: "ORDER_CANNOT_BE_MODIFIED",
        });
        await expect(
          asTenant(() => receipts.generatePublicToken(receipt.id, user)),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
          asTenant(() => receipts.regenerateReceiptPdf(receipt.id, user)),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          asTenant(() => artifacts.repair(receipt.id, user.id)),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          asTenant(() => receipts.voidReceipt(receipt.id, user, "again")),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
          asTenant(() => orders.confirm(order.id, user)),
        ).rejects.toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });
        await expect(
          asTenant(() =>
            orders.update(
              order.id,
              { items: [{ productId: product.id, qty: 1 }] },
              user,
            ),
          ),
        ).rejects.toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });

        expect(await storedReceipt(receipt.id)).toMatchObject({
          status: ReceiptStatus.VOID,
          public_token: null,
          active_revision: 1,
          pdf_path: receipt.pdf_path,
        });
        expect(await orderStatus(order.id)).toBe(OrderStatus.CANCELLED);
      });
    });
  },
);
