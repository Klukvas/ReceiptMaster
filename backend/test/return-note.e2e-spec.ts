import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { CacheService } from "../src/common/services/cache.service";
import { ApiErrorResponse } from "../src/common/errors/ApiError";
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
import { UserSettings } from "../src/modules/settings/entities/user-settings.entity";
import { DocumentAssetsService } from "../src/modules/settings/services/document-assets.service";
import { DocumentConfigService } from "../src/modules/settings/services/document-config.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { ReceiptsController } from "../src/modules/receipts/receipts.controller";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { ReceiptOutboxService } from "../src/modules/receipts/receipt-outbox.service";
import { ReceiptArtifactService } from "../src/modules/receipts/services/receipt-artifact.service";
import { ReceiptSnapshotService } from "../src/modules/receipts/services/receipt-snapshot.service";
import { DocumentRenderService } from "../src/modules/receipts/services/document-render.service";
import { DocumentArtifactsService } from "../src/modules/receipts/services/document-artifacts.service";
import { TemplateService } from "../src/modules/receipts/services/template.service";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { RestrictedAppDatabase } from "./helpers/restricted-app-database";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";

const FIXTURE_PDF = Buffer.from("%PDF-1.4 document generation fixture");
const SELLER_IBAN = "UA213223130000026007233566001";
const BUYER_IBAN = "UA903052992990004149123456789";
const BUYER_TAX_ID = "87654321";
const VAT_ID = "123456789012";
const SIGNATORY = "Петренко Петро Петрович";
const KEEP = { logoAction: "keep" } as const;

// The real order, settings, snapshot and receipt services as a restricted role on a
// fully migrated database. Chromium, object storage, the queue and the gateway are doubles.
describeIsolatedPostgres(
  "goods return notes on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let orders: OrdersService;
    let receipts: ReceiptsService;
    let snapshots: ReceiptSnapshotService;
    let artifacts: ReceiptArtifactService;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_return");
      const { app } = db;
      const subscription = new SubscriptionService(
        app.getRepository(UserSubscription),
        app.getRepository(Product),
        app.getRepository(Order),
        app,
      );
      const renderer = { generatePdf: async () => FIXTURE_PDF };
      const storage = {
        uploadReceipt: async (_buffer: Buffer, filename: string) =>
          `https://storage.example.test/${filename}`,
        parseObjectStoragePath: (path: string) => ({
          bucket: "receipts",
          key: path.replace("object-storage://", ""),
        }),
        fileExists: async () => true,
      };
      const assets = new DocumentAssetsService(app, {
        userHasLogo: async () => false,
      } as never);
      const configs = new DocumentConfigService(app, assets, {
        del: async () => undefined,
      } as unknown as CacheService);
      const renders = new DocumentRenderService(
        new TemplateService(),
        renderer as never,
        assets,
      );
      snapshots = new ReceiptSnapshotService(app, configs, assets, renders);
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
        configs,
        renders,
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
        email: `${randomUUID()}@docgen.invalid`,
        password: "fixture",
      });
      recipient = await db.admin.getRepository(Recipient).save({
        name: "Іван Покупець",
        user_id: user.id,
        legal_name: "ТОВ Покупець",
        tax_id: BUYER_TAX_ID,
        tax_id_kind: "edrpou",
        iban: BUYER_IBAN,
      });
      await db.admin.getRepository(UserSettings).save({
        userId: user.id,
        companyName: "ТОВ Продавець",
        companyTaxId: "12345678",
        companyIban: SELLER_IBAN,
        templateLanguage: "uk",
        companyVatPayer: true,
        companyVatId: VAT_ID,
        companySignatoryName: SIGNATORY,
        companySignatoryPosition: "Директор",
      });
    });

    const asTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      runWithTenant(user.id, operation);

    const confirmedOrder = async (
      quantities: number[] = [3, 1],
    ): Promise<{ order: Order; items: OrderItem[] }> => {
      const products = await Promise.all(
        quantities.map((qty) =>
          db.admin.getRepository(Product).save(
            db.admin.getRepository(Product).create({
              name: randomUUID(),
              user_id: user.id,
              purchase_price_cents: 100,
              sale_price_cents: 500,
              quantity: qty + 5,
              currency: Currency.UAH,
            }),
          ),
        ),
      );
      const draft = (
        await asTenant(() =>
          orders.create(
            {
              recipientId: recipient.id,
              items: products.map((product, index) => ({
                productId: product.id,
                qty: quantities[index],
              })),
            },
            user,
          ),
        )
      ).data as Order;
      const order = await asTenant(() => orders.confirm(draft.id, user));
      // Same order as the requested quantities, whatever the random ids sort to.
      const found = await db.admin.getRepository(OrderItem).find({
        where: { order_id: order.id },
      });
      const items = [...found].sort((a, b) => b.qty - a.qty);
      return { order, items };
    };

    const giveBack = (
      order: Order,
      lines: Array<{ orderItemId: string; qty: number }>,
      reason?: string,
    ) =>
      asTenant(() =>
        receipts.generateDocument(
          order.id,
          user,
          DocumentType.RETURN_NOTE,
          KEEP,
          { lines, ...(reason ? { reason } : {}) },
        ),
      );

    const stored = (id: string) =>
      db.admin
        .getRepository(Receipt)
        .createQueryBuilder("r")
        .addSelect([
          "r.pending_snapshot",
          "r.active_snapshot",
          "r.generation_id",
        ])
        .where("r.id = :id", { id })
        .getOneOrFail();

    const promote = async (receipt: Receipt) => {
      const row = await stored(receipt.id);
      return asTenant(() =>
        artifacts.execute(receipt.id, user.id, row.generation_id as string),
      );
    };

    const returnedQty = async (item: OrderItem): Promise<number> =>
      (await db.admin.getRepository(OrderItem).findOneByOrFail({ id: item.id }))
        .returned_qty;

    const counter = async (): Promise<number> => {
      const rows: Array<{ value: number }> = await db.admin.query(
        `SELECT value FROM document_counters WHERE user_id = $1 AND document_type = 'return_note'`,
        [user.id],
      );
      return rows[0]?.value ?? 0;
    };

    const noteCount = (order: Order) =>
      db.admin.getRepository(Receipt).count({
        where: { order_id: order.id, document_type: DocumentType.RETURN_NOTE },
      });

    const rejection = async (operation: Promise<unknown>) => {
      try {
        await operation;
      } catch (error) {
        return error;
      }
      throw new Error("expected a rejection");
    };

    it("issues several notes for one order, each numbered, without locking it", async () => {
      const { order, items } = await confirmedOrder();

      const first = await giveBack(
        order,
        [{ orderItemId: items[0].id, qty: 1 }],
        "Брак",
      );
      const second = await giveBack(order, [
        { orderItemId: items[0].id, qty: 1 },
        { orderItemId: items[1].id, qty: 1 },
      ]);

      expect([first.number, second.number]).toEqual([
        `${new Date().getUTCFullYear()}-000001`,
        `${new Date().getUTCFullYear()}-000002`,
      ]);
      expect(await noteCount(order)).toBe(2);
      expect(await returnedQty(items[0])).toBe(2);
      expect(await returnedQty(items[1])).toBe(1);
      expect(
        (await db.admin.getRepository(Order).findOneByOrFail({ id: order.id }))
          .is_locked,
      ).toBe(false);
      expect((await promote(first))?.status).toBe(ReceiptStatus.GENERATED);
      expect(
        (await db.admin.getRepository(Order).findOneByOrFail({ id: order.id }))
          .is_locked,
      ).toBe(false);
    });

    it("freezes the lines, reason and the source, and prints only the returned part", async () => {
      const { order, items } = await confirmedOrder();
      const waybill = await asTenant(() =>
        receipts.generateDocument(order.id, user, DocumentType.WAYBILL, KEEP),
      );
      await promote(waybill);

      const note = await giveBack(
        order,
        [{ orderItemId: items[0].id, qty: 2 }],
        "Брак",
      );

      const snapshot = (await stored(note.id)).pending_snapshot;
      expect(snapshot?.document).toMatchObject({
        type: DocumentType.RETURN_NOTE,
        title: "Накладна на повернення товару",
        details: {
          returnLines: [{ orderItemId: items[0].id, qty: 2 }],
          returnReason: "Брак",
          returnSource: { kind: "waybill" },
        },
      });
      expect(snapshot?.order.items).toHaveLength(1);
      expect(snapshot?.order.items[0].qty).toBe(2);
      expect(snapshot?.order.total_cents).toBe(
        snapshot?.order.items[0].line_total_cents,
      );
    });

    it("refuses more than was sold across notes with the remaining quantity, and burns no number", async () => {
      const { order, items } = await confirmedOrder();
      await giveBack(order, [{ orderItemId: items[0].id, qty: 2 }]);
      expect(await counter()).toBe(1);

      const error = (await rejection(
        giveBack(order, [{ orderItemId: items[0].id, qty: 2 }]),
      )) as ApiErrorResponse;

      expect(error.errorCode).toBe("RETURN_QUANTITY_EXCEEDED");
      expect(error.statusCode).toBe(422);
      expect(error.toJSON()).toMatchObject({
        items: [{ orderItemId: items[0].id, requested: 2, remaining: 1 }],
      });
      expect(await returnedQty(items[0])).toBe(2);
      expect(await noteCount(order)).toBe(1);
      expect(await counter()).toBe(1);
    });

    it("lets exactly one of two concurrent notes take the last pieces", async () => {
      const { order, items } = await confirmedOrder([2]);

      const settled = await Promise.allSettled([
        giveBack(order, [{ orderItemId: items[0].id, qty: 2 }]),
        giveBack(order, [{ orderItemId: items[0].id, qty: 2 }]),
        giveBack(order, [{ orderItemId: items[0].id, qty: 2 }]),
      ]);

      const accepted = settled.filter((r) => r.status === "fulfilled");
      const refused = settled.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(accepted).toHaveLength(1);
      expect(refused).toHaveLength(2);
      for (const result of refused)
        expect(result.reason).toMatchObject({
          errorCode: "RETURN_QUANTITY_EXCEEDED",
        });
      expect(await returnedQty(items[0])).toBe(2);
      expect(await noteCount(order)).toBe(1);
    });

    it("gives the quantities back when a note is voided and accepts them again", async () => {
      const { order, items } = await confirmedOrder();
      const note = await giveBack(order, [
        { orderItemId: items[0].id, qty: 3 },
      ]);
      await promote(note);
      await rejection(giveBack(order, [{ orderItemId: items[0].id, qty: 1 }]));

      await asTenant(() => receipts.voidReceipt(note.id, user, "mistake"));
      expect(await returnedQty(items[0])).toBe(0);

      const again = await giveBack(order, [
        { orderItemId: items[0].id, qty: 3 },
      ]);
      expect(again.id).not.toBe(note.id);
      expect(await returnedQty(items[0])).toBe(3);
      // The voided row stays as history next to the live one.
      expect(await noteCount(order)).toBe(2);
    });

    it("releases the quantities of a note whose rendering failed, and is not released twice", async () => {
      const { order, items } = await confirmedOrder();
      const note = await giveBack(order, [
        { orderItemId: items[0].id, qty: 3 },
      ]);
      const row = await stored(note.id);
      await giveBack(order, [{ orderItemId: items[1].id, qty: 1 }]);

      await expect(
        asTenant(() =>
          artifacts.failed(note.id, user.id, row.generation_id as string),
        ),
      ).resolves.toBe(true);

      expect(
        (await db.admin.getRepository(Receipt).findOneByOrFail({ id: note.id }))
          .status,
      ).toBe(ReceiptStatus.FAILED);
      expect(await returnedQty(items[0])).toBe(0);
      expect(await returnedQty(items[1])).toBe(1);
      await giveBack(order, [{ orderItemId: items[0].id, qty: 3 }]);
      await asTenant(() => receipts.voidReceipt(note.id, user, "cleanup"));
      expect(await returnedQty(items[0])).toBe(3);
    });

    it("releases the quantities when the outbox finds the job exhausted, exactly once", async () => {
      const { order, items } = await confirmedOrder();
      const note = await giveBack(order, [
        { orderItemId: items[0].id, qty: 3 },
      ]);
      const outbox = new ReceiptOutboxService(
        db.app,
        () =>
          ({
            queue: {
              getJob: async (jobId: string) =>
                jobId.includes(note.id)
                  ? { getState: async () => "failed" }
                  : null,
              add: async () => undefined,
            },
            close: () => undefined,
          }) as never,
      );

      await outbox.dispatch();
      expect(
        (await db.admin.getRepository(Receipt).findOneByOrFail({ id: note.id }))
          .status,
      ).toBe(ReceiptStatus.FAILED);
      expect(await returnedQty(items[0])).toBe(0);

      // Another note takes the freed pieces; a second pass must not hand them back again.
      await giveBack(order, [{ orderItemId: items[0].id, qty: 3 }]);
      await outbox.dispatch();
      await asTenant(() =>
        artifacts.failed(note.id, user.id, "stale-generation"),
      );
      expect(await returnedQty(items[0])).toBe(3);
    });

    it("keeps the quantities when the order is cancelled", async () => {
      const { order, items } = await confirmedOrder();
      const note = await giveBack(order, [
        { orderItemId: items[0].id, qty: 2 },
      ]);

      await asTenant(() => orders.cancel(order.id, user));

      expect(
        (await db.admin.getRepository(Receipt).findOneByOrFail({ id: note.id }))
          .status,
      ).toBe(ReceiptStatus.VOID);
      expect(await returnedQty(items[0])).toBe(2);
    });

    it("never evicts a return note: the cap is not enforced for it and the ledger stays", async () => {
      const { order, items } = await confirmedOrder([12]);
      const issued: Receipt[] = [];
      for (let index = 0; index < 11; index++) {
        const note = await giveBack(order, [
          { orderItemId: items[0].id, qty: 1 },
        ]);
        await promote(note);
        issued.push(note);
      }

      expect(await noteCount(order)).toBe(11);
      expect(
        await db.admin.getRepository(Receipt).findOneBy({ id: issued[0].id }),
      ).not.toBeNull();
      expect(await returnedQty(items[0])).toBe(11);
      const error = (await rejection(
        giveBack(order, [{ orderItemId: items[0].id, qty: 2 }]),
      )) as ApiErrorResponse;
      expect(error.errorCode).toBe("RETURN_QUANTITY_EXCEEDED");
    });

    it("refuses a draft order and a foreign line, leaving the ledger and the counter alone", async () => {
      const { order, items } = await confirmedOrder();
      const other = await confirmedOrder();
      const product = await db.admin
        .getRepository(Product)
        .findOneByOrFail({ user_id: user.id });
      const draft = (
        await asTenant(() =>
          orders.create(
            {
              recipientId: recipient.id,
              items: [{ productId: product.id, qty: 1 }],
            },
            user,
          ),
        )
      ).data as Order;

      expect(
        await rejection(
          giveBack(draft, [{ orderItemId: items[0].id, qty: 1 }]),
        ),
      ).toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });
      expect(
        await rejection(
          giveBack(order, [{ orderItemId: other.items[0].id, qty: 1 }]),
        ),
      ).toMatchObject({ errorCode: "VALIDATION_ERROR" });
      expect(await returnedQty(items[0])).toBe(0);
      expect(await returnedQty(other.items[0])).toBe(0);
      expect(await counter()).toBe(0);
    });

    it("refuses the thermal style before any number is drawn", async () => {
      const { order, items } = await confirmedOrder();
      const error = await rejection(
        asTenant(() =>
          receipts.generateDocument(
            order.id,
            user,
            DocumentType.RETURN_NOTE,
            { logoAction: "keep", config: { templateId: "thermal" } as never },
            { lines: [{ orderItemId: items[0].id, qty: 1 }] },
          ),
        ),
      );
      expect(error).toBeDefined();
      expect(await returnedQty(items[0])).toBe(0);
      expect(await counter()).toBe(0);
    });

    it("lets the database itself refuse a ledger outside 0..qty, for the app role too", async () => {
      const { items } = await confirmedOrder();
      const attempt = (value: number) =>
        asTenant(() =>
          db.app.query(
            `UPDATE order_items SET returned_qty = $1 WHERE id = $2`,
            [value, items[0].id],
          ),
        );

      await expect(attempt(items[0].qty + 1)).rejects.toMatchObject({
        code: "23514",
        constraint: "CHK_order_items_returned_qty_range",
      });
      await expect(attempt(-1)).rejects.toMatchObject({ code: "23514" });
      await expect(attempt(items[0].qty)).resolves.toBeDefined();
    });

    it("exposes the returned quantity on the order lines", async () => {
      const { order, items } = await confirmedOrder();
      await giveBack(order, [{ orderItemId: items[0].id, qty: 2 }]);

      const loaded = await asTenant(() => orders.findOne(order.id, user));

      expect(
        loaded.items.find((item) => item.id === items[0].id)?.returned_qty,
      ).toBe(2);
      expect(
        loaded.items.find((item) => item.id === items[1].id)?.returned_qty,
      ).toBe(0);
    });
  },
);
