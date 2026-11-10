import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "crypto";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { CacheService } from "../src/common/services/cache.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import { Order } from "../src/modules/orders/entities/order.entity";
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
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { isLockingDocumentType } from "../src/modules/receipts/order-lock";
import { ReceiptArtifactService } from "../src/modules/receipts/services/receipt-artifact.service";
import { ReceiptSnapshotService } from "../src/modules/receipts/services/receipt-snapshot.service";
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

const FIXTURE_PDF = Buffer.from("%PDF-1.4 order lock fixture");

// Real order and receipt services as a restricted role on a fully migrated
// database, through the production tenant query context. Only Chromium, object
// storage, the queue and the socket gateway are doubles.
describeIsolatedPostgres(
  "order lock: is_locked follows the live locking documents on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let orders: OrdersService;
    let receipts: ReceiptsService;
    let artifacts: ReceiptArtifactService;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_orderlock");
      const { app } = db;
      const subscription = new SubscriptionService(
        app.getRepository(UserSubscription),
        app.getRepository(Product),
        app.getRepository(Order),
        app,
      );
      const renderer = {
        generatePdf: async () => {
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
        storage as never,
        app,
        { get: () => "https://example.test" } as never,
        { dispatch: async () => undefined } as never,
        snapshots,
        artifacts,
        undefined,
        undefined,
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
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@orderlock.invalid`,
        password: "fixture",
      });
      recipient = await db.admin
        .getRepository(Recipient)
        .save({ name: "Order lock recipient", user_id: user.id });
    });

    const asTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      runWithTenant(user.id, operation);

    const confirmedOrder = async (): Promise<Order> => {
      const product = await db.admin.getRepository(Product).save(
        db.admin.getRepository(Product).create({
          name: randomUUID(),
          user_id: user.id,
          purchase_price_cents: 100,
          sale_price_cents: 500,
          quantity: 10,
          currency: Currency.UAH,
        }),
      );
      const draft = (
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
      return asTenant(() => orders.confirm(draft.id, user));
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

    const isLocked = async (order: Order) =>
      (await db.admin.getRepository(Order).findOneByOrFail({ id: order.id }))
        .is_locked;

    /** An issued document. It does not touch `orders.is_locked`; see `issued`. */
    const generatedDocument = (
      order: Order,
      document_type: DocumentType,
    ): Promise<Receipt> => {
      const active = frozen(`Active ${document_type}`);
      return db.admin.getRepository(Receipt).save({
        user_id: user.id,
        order_id: order.id,
        number: randomUUID().slice(0, 20),
        document_type,
        status: ReceiptStatus.GENERATED,
        public_token: randomBytes(32).toString("hex"),
        html_snapshot: active.html,
        active_snapshot: active.snapshot,
        active_revision: 1,
        pdf_path: `object-storage://receipts/${user.id}/${document_type}.pdf`,
        pdf_url: `https://storage.example.test/${document_type}.pdf`,
        hash: "active",
        progress: 100,
      });
    };

    /** What promotion leaves for a locking document: issued and the order locked. */
    const issued = async (order: Order, type: DocumentType) => {
      const receipt = await generatedDocument(order, type);
      if (isLockingDocumentType(type))
        await db.admin
          .getRepository(Order)
          .update({ id: order.id }, { is_locked: true });
      return receipt;
    };

    const processingDocument = async (
      order: Order,
      document_type: DocumentType,
    ): Promise<{ receipt: Receipt; generationId: string }> => {
      const candidate = frozen(`Pending ${document_type}`);
      const generationId = randomUUID();
      const receipt = await db.admin.getRepository(Receipt).save({
        user_id: user.id,
        order_id: order.id,
        number: randomUUID().slice(0, 20),
        document_type,
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
      return { receipt, generationId };
    };

    const voidDocument = (receipt: Receipt) =>
      asTenant(() => receipts.voidReceipt(receipt.id, user, "test"));

    const storedGenerationId = async (id: string) =>
      (
        await db.admin
          .getRepository(Receipt)
          .createQueryBuilder("r")
          .addSelect("r.generation_id")
          .where("r.id = :id", { id })
          .getOneOrFail()
      ).generation_id as string;

    describe("voidReceipt", () => {
      it("unlocks the order when its only waybill is voided", async () => {
        const order = await confirmedOrder();
        const waybill = await issued(order, DocumentType.WAYBILL);
        expect(await isLocked(order)).toBe(true);

        await voidDocument(waybill);

        expect(await isLocked(order)).toBe(false);
      });

      it("keeps the order locked until the last locking document is voided", async () => {
        const order = await confirmedOrder();
        const waybill = await issued(order, DocumentType.WAYBILL);
        const invoice = await issued(order, DocumentType.INVOICE);

        await voidDocument(waybill);
        expect(await isLocked(order)).toBe(true);

        await voidDocument(invoice);
        expect(await isLocked(order)).toBe(false);
      });

      it("ignores a quote: voiding the waybill unlocks the order next to a live quote", async () => {
        const order = await confirmedOrder();
        const waybill = await issued(order, DocumentType.WAYBILL);
        const quote = await issued(order, DocumentType.QUOTE);

        await voidDocument(waybill);

        expect(await isLocked(order)).toBe(false);
        const stored = await db.admin
          .getRepository(Receipt)
          .findOneByOrFail({ id: quote.id });
        expect(stored.status).toBe(ReceiptStatus.GENERATED);
      });

      it("keeps the order locked when a quote is voided next to a live waybill", async () => {
        const order = await confirmedOrder();
        await issued(order, DocumentType.WAYBILL);
        const quote = await issued(order, DocumentType.QUOTE);

        await voidDocument(quote);

        expect(await isLocked(order)).toBe(true);
      });

      it("keeps the order locked when a PROCESSING document is voided next to a live waybill", async () => {
        const order = await confirmedOrder();
        await issued(order, DocumentType.WAYBILL);
        const { receipt } = await processingDocument(
          order,
          DocumentType.INVOICE,
        );

        await voidDocument(receipt);

        expect(await isLocked(order)).toBe(true);
      });

      it("leaves the tenant's other orders alone", async () => {
        const order = await confirmedOrder();
        const waybill = await issued(order, DocumentType.WAYBILL);
        const otherOrder = await confirmedOrder();
        await issued(otherOrder, DocumentType.WAYBILL);

        await voidDocument(waybill);

        expect(await isLocked(order)).toBe(false);
        expect(await isLocked(otherOrder)).toBe(true);
      });
    });

    describe("documents on an unlocked order", () => {
      it("promotes a PROCESSING quote without locking the order", async () => {
        const order = await confirmedOrder();
        const { receipt, generationId } = await processingDocument(
          order,
          DocumentType.QUOTE,
        );

        const promoted = await asTenant(() =>
          artifacts.execute(receipt.id, user.id, generationId),
        );

        expect(promoted?.status).toBe(ReceiptStatus.GENERATED);
        expect(await isLocked(order)).toBe(false);
      });

      it("promotes a PROCESSING waybill and locks the order", async () => {
        const order = await confirmedOrder();
        const { receipt, generationId } = await processingDocument(
          order,
          DocumentType.WAYBILL,
        );

        const promoted = await asTenant(() =>
          artifacts.execute(receipt.id, user.id, generationId),
        );

        expect(promoted?.status).toBe(ReceiptStatus.GENERATED);
        expect(await isLocked(order)).toBe(true);
      });

      it("repairs a GENERATED quote", async () => {
        const order = await confirmedOrder();
        const quote = await generatedDocument(order, DocumentType.QUOTE);

        const buffer = await asTenant(() =>
          artifacts.repair(quote.id, user.id),
        );

        expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
      });

      it("refuses to repair a GENERATED waybill on an unlocked order", async () => {
        const order = await confirmedOrder();
        const waybill = await generatedDocument(order, DocumentType.WAYBILL);

        await expect(
          asTenant(() => artifacts.repair(waybill.id, user.id)),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it("promotes the replacement of a GENERATED quote", async () => {
        const order = await confirmedOrder();
        const quote = await generatedDocument(order, DocumentType.QUOTE);

        await asTenant(() => receipts.regenerateReceiptPdf(quote.id, user));
        const promoted = await asTenant(async () =>
          artifacts.execute(
            quote.id,
            user.id,
            await storedGenerationId(quote.id),
          ),
        );

        expect(promoted?.active_revision).toBe(2);
        expect(await isLocked(order)).toBe(false);
      });

      it("drops the replacement of a GENERATED waybill on an unlocked order", async () => {
        const order = await confirmedOrder();
        const waybill = await generatedDocument(order, DocumentType.WAYBILL);

        await asTenant(() => receipts.regenerateReceiptPdf(waybill.id, user));
        const promoted = await asTenant(async () =>
          artifacts.execute(
            waybill.id,
            user.id,
            await storedGenerationId(waybill.id),
          ),
        );

        expect(promoted).toBeNull();
      });
    });

    describe("retention is counted per document type", () => {
      const LIMIT = 10;

      // The free plan allows 20 orders a month, so a test that needs two full
      // types issues both on the same ten orders (one order may carry one of each).
      const generatedOfType = async (
        type: DocumentType,
        count: number,
        onOrders?: Order[],
      ) => {
        const created: Receipt[] = [];
        for (let i = 0; i < count; i++)
          created.push(
            await generatedDocument(
              onOrders?.[i] ?? (await confirmedOrder()),
              type,
            ),
          );
        return created;
      };

      const idsOfType = async (type: DocumentType, status: ReceiptStatus) =>
        (
          await db.admin.getRepository(Receipt).find({
            where: { user_id: user.id, document_type: type, status },
          })
        ).map((r) => r.id);

      const promote = async (type: DocumentType, order?: Order) => {
        const { receipt, generationId } = await processingDocument(
          order ?? (await confirmedOrder()),
          type,
        );
        return asTenant(() =>
          artifacts.execute(receipt.id, user.id, generationId),
        );
      };

      it("promoting an 11th waybill evicts only the oldest waybill", async () => {
        const waybills = await generatedOfType(DocumentType.WAYBILL, LIMIT);

        const promoted = await promote(DocumentType.WAYBILL);

        expect(promoted?.status).toBe(ReceiptStatus.GENERATED);
        const left = await idsOfType(
          DocumentType.WAYBILL,
          ReceiptStatus.GENERATED,
        );
        expect(left).toHaveLength(LIMIT);
        expect(left).not.toContain(waybills[0].id);
        expect(left).toContain(promoted?.id);
      });

      it("unlocks the order of an evicted waybill, but not one an invoice still locks", async () => {
        const orders = await Promise.all(
          Array.from({ length: LIMIT }, () => confirmedOrder()),
        );
        // The two oldest waybills sit on orders 0 and 1; order 1 also carries an invoice.
        for (const order of orders) await issued(order, DocumentType.WAYBILL);
        await issued(orders[1], DocumentType.INVOICE);
        expect(await isLocked(orders[0])).toBe(true);

        await promote(DocumentType.WAYBILL);

        expect(await isLocked(orders[0])).toBe(false);
        // Order 1's waybill is still within the cap, so only order 0 lost its document.
        expect(await isLocked(orders[1])).toBe(true);
        const next = await promote(DocumentType.WAYBILL);
        expect(next?.status).toBe(ReceiptStatus.GENERATED);
        expect(await isLocked(orders[1])).toBe(true);
      });

      it("ten generated invoices do not count toward the waybill limit", async () => {
        const invoices = await generatedOfType(DocumentType.INVOICE, LIMIT);
        await generatedOfType(DocumentType.WAYBILL, 9);

        await promote(DocumentType.WAYBILL);

        // The tenth waybill is within the cap, so nothing is evicted.
        expect(
          await idsOfType(DocumentType.WAYBILL, ReceiptStatus.GENERATED),
        ).toHaveLength(10);
        expect(
          await idsOfType(DocumentType.INVOICE, ReceiptStatus.GENERATED),
        ).toEqual(expect.arrayContaining(invoices.map((r) => r.id)));
      });

      it("promoting a waybill next to ten invoices evicts nothing", async () => {
        await generatedOfType(DocumentType.INVOICE, LIMIT);

        const promoted = await promote(DocumentType.WAYBILL);

        expect(promoted?.status).toBe(ReceiptStatus.GENERATED);
        expect(
          await idsOfType(DocumentType.INVOICE, ReceiptStatus.GENERATED),
        ).toHaveLength(LIMIT);
      });

      it("never evicts an invoice, however many there are, and leaves the waybills alone", async () => {
        const sharedOrders: Order[] = [];
        for (let i = 0; i < LIMIT; i++)
          sharedOrders.push(await confirmedOrder());
        const waybills = await generatedOfType(
          DocumentType.WAYBILL,
          LIMIT,
          sharedOrders,
        );
        const invoices = await generatedOfType(
          DocumentType.INVOICE,
          LIMIT,
          sharedOrders,
        );

        await promote(DocumentType.INVOICE);

        const leftInvoices = await idsOfType(
          DocumentType.INVOICE,
          ReceiptStatus.GENERATED,
        );
        // Evicting an invoice would free its slot: the order could be invoiced twice.
        expect(leftInvoices).toHaveLength(LIMIT + 1);
        expect(leftInvoices).toEqual(
          expect.arrayContaining(invoices.map((r) => r.id)),
        );
        expect(
          await idsOfType(DocumentType.WAYBILL, ReceiptStatus.GENERATED),
        ).toEqual(expect.arrayContaining(waybills.map((r) => r.id)));
      });

      it("does not count or evict PROCESSING, FAILED, VOID documents or another tenant", async () => {
        const waybills = await generatedOfType(DocumentType.WAYBILL, 9);
        const processing = (
          await processingDocument(await confirmedOrder(), DocumentType.WAYBILL)
        ).receipt;
        const failed = await generatedDocument(
          await confirmedOrder(),
          DocumentType.WAYBILL,
        );
        await db.admin
          .getRepository(Receipt)
          .update({ id: failed.id }, { status: ReceiptStatus.FAILED });
        const voided = await generatedDocument(
          await confirmedOrder(),
          DocumentType.WAYBILL,
        );
        await db.admin
          .getRepository(Receipt)
          .update({ id: voided.id }, { status: ReceiptStatus.VOID });
        const stranger = await db.admin.getRepository(User).save({
          email: `${randomUUID()}@orderlock.invalid`,
          password: "fixture",
        });
        const strangerOrder = await confirmedOrder();
        const foreign = await db.admin.getRepository(Receipt).save({
          user_id: stranger.id,
          order_id: strangerOrder.id,
          number: randomUUID().slice(0, 20),
          document_type: DocumentType.WAYBILL,
          status: ReceiptStatus.GENERATED,
        });

        // The tenth generated waybill: within the cap, so nothing is evicted.
        await promote(DocumentType.WAYBILL);

        const stored = async (id: string) =>
          db.admin.getRepository(Receipt).findOneBy({ id });
        expect((await stored(processing.id))?.status).toBe(
          ReceiptStatus.PROCESSING,
        );
        expect((await stored(failed.id))?.status).toBe(ReceiptStatus.FAILED);
        expect((await stored(voided.id))?.status).toBe(ReceiptStatus.VOID);
        expect(await stored(foreign.id)).not.toBeNull();
        expect(
          await idsOfType(DocumentType.WAYBILL, ReceiptStatus.GENERATED),
        ).toEqual(expect.arrayContaining(waybills.map((r) => r.id)));
      });

      describe("getRetention", () => {
        it("defaults to waybill and ignores other types", async () => {
          await generatedOfType(DocumentType.INVOICE, LIMIT);
          await generatedOfType(DocumentType.WAYBILL, 3);

          const result = await asTenant(() => receipts.getRetention(user));

          expect(result).toEqual({ limit: LIMIT, count: 3, replaces: null });
        });

        it("counts only invoices for type=invoice but never offers one for replacement", async () => {
          await generatedOfType(DocumentType.WAYBILL, 2);
          await generatedOfType(DocumentType.INVOICE, LIMIT);

          const result = await asTenant(() =>
            receipts.getRetention(user, DocumentType.INVOICE),
          );

          expect(result.count).toBe(LIMIT);
          expect(result.replaces).toBeNull();
        });

        it("replaces the oldest waybill when the waybills are full", async () => {
          await generatedOfType(DocumentType.INVOICE, 2);
          const waybills = await generatedOfType(DocumentType.WAYBILL, LIMIT);

          const result = await asTenant(() => receipts.getRetention(user));

          expect(result.count).toBe(LIMIT);
          expect(result.replaces?.id).toBe(waybills[0].id);
        });

        it("does not name a replacement for a waybill while only invoices are full", async () => {
          await generatedOfType(DocumentType.INVOICE, LIMIT);

          const result = await asTenant(() => receipts.getRetention(user));

          expect(result).toEqual({ limit: LIMIT, count: 0, replaces: null });
        });
      });
    });
  },
);
