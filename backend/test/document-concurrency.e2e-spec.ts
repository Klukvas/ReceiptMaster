import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { CacheService } from "../src/common/services/cache.service";
import { ApiErrorResponse } from "../src/common/errors/ApiError";
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
import { UserSettings } from "../src/modules/settings/entities/user-settings.entity";
import { DocumentAssetsService } from "../src/modules/settings/services/document-assets.service";
import { DocumentConfigService } from "../src/modules/settings/services/document-config.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
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
const FIRST_NUMBER = `${new Date().getUTCFullYear()}-000001`;
const KEEP = { logoAction: "keep" } as const;

// The real order, settings, snapshot and receipt services as a restricted role on a
// fully migrated database. Chromium, object storage, the queue and the gateway are doubles.
describeIsolatedPostgres(
  "document generation concurrency on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let orders: OrdersService;
    let receipts: ReceiptsService;
    // A second instance has its own in-process mutex, like a second server process.
    let buildReceipts: () => ReceiptsService;
    let snapshots: ReceiptSnapshotService;
    let artifacts: ReceiptArtifactService;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_docconc");
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
        normalizeLogo: async () => {
          throw new BadRequestException("Unreadable image");
        },
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
      buildReceipts = () =>
        new ReceiptsService(
          app.getRepository(Receipt),
          storage as never,
          app,
          { get: () => "https://example.test" } as never,
          { dispatch: async () => undefined } as never,
          snapshots,
          artifacts,
          configs,
          renders,
        );
      receipts = buildReceipts();
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

    const generate = (
      order: Order,
      type: DocumentType,
      details?: Parameters<ReceiptsService["generateDocument"]>[4],
    ) =>
      asTenant(() =>
        receipts.generateDocument(order.id, user, type, KEEP, details),
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

    const isLocked = async (order: Order) =>
      (await db.admin.getRepository(Order).findOneByOrFail({ id: order.id }))
        .is_locked;

    const counter = async (type: DocumentType): Promise<number> => {
      const rows: Array<{ value: number }> = await db.admin.query(
        `SELECT value FROM document_counters WHERE user_id = $1 AND document_type = $2`,
        [user.id, type],
      );
      return rows[0]?.value ?? 0;
    };

    const rejection = async (operation: Promise<unknown>) => {
      try {
        await operation;
      } catch (error) {
        return error;
      }
      throw new Error("expected a rejection");
    };

    const rows = (order: Order) =>
      db.admin.getRepository(Receipt).find({
        where: { order_id: order.id },
        order: { document_type: "ASC" },
      });

    describe("refusals after preflight", () => {
      it("an order currency that cannot be printed is refused in preflight without moving the counter", async () => {
        const order = await confirmedOrder();
        await db.admin.query(
          `UPDATE orders SET currency = 'uah' WHERE id = $1`,
          [order.id],
        );

        const error = await rejection(generate(order, DocumentType.INVOICE));

        expect((error as ApiErrorResponse).errorCode).toBe(
          "DOCUMENT_AMOUNT_INVALID",
        );
        expect(await counter(DocumentType.INVOICE)).toBe(0);
        expect(await rows(order)).toHaveLength(0);
      });

      it.each([DocumentType.INVOICE, DocumentType.ACT])(
        "a broken logo file does not move the %s counter",
        async (type) => {
          const order = await confirmedOrder();

          const error = await rejection(
            asTenant(() =>
              receipts.generateDocument(
                order.id,
                user,
                type,
                { logoAction: "replace" },
                undefined,
                {
                  buffer: Buffer.from("not an image"),
                  mimetype: "image/png",
                } as Express.Multer.File,
              ),
            ),
          );

          expect(error).toBeInstanceOf(BadRequestException);
          expect(await counter(type)).toBe(0);
          expect(await rows(order)).toHaveLength(0);
        },
      );
    });

    describe("parallel requests", () => {
      it("invoice, act and waybill on one order all succeed with one number each", async () => {
        const order = await confirmedOrder();

        const [invoice, act, waybill] = await Promise.all([
          generate(order, DocumentType.INVOICE),
          generate(order, DocumentType.ACT),
          generate(order, DocumentType.WAYBILL),
        ]);

        expect([invoice.number, act.number, waybill.number]).toEqual([
          FIRST_NUMBER,
          FIRST_NUMBER,
          FIRST_NUMBER,
        ]);
        const promoted = await Promise.all(
          [invoice, act, waybill].map((r) => promote(r)),
        );
        expect(promoted.map((r) => r?.status)).toEqual([
          ReceiptStatus.GENERATED,
          ReceiptStatus.GENERATED,
          ReceiptStatus.GENERATED,
        ]);
        expect(await isLocked(order)).toBe(true);
        expect((await rows(order)).length).toBe(3);
        for (const type of [
          DocumentType.INVOICE,
          DocumentType.ACT,
          DocumentType.WAYBILL,
        ])
          expect(await counter(type)).toBe(1);
        const waybillRow = await stored(waybill.id);
        expect(waybillRow.active_snapshot?.document).toBeUndefined();
      });

      it("a double request of the same type leaves exactly one row", async () => {
        const order = await confirmedOrder();

        const results = await Promise.allSettled([
          generate(order, DocumentType.INVOICE),
          generate(order, DocumentType.INVOICE),
        ]);

        const invoices = (await rows(order)).filter(
          (r) => r.document_type === DocumentType.INVOICE,
        );
        expect(invoices).toHaveLength(1);
        const ok = results.filter((r) => r.status === "fulfilled");
        expect(ok.length).toBe(2);
        expect(await counter(DocumentType.INVOICE)).toBe(1);
        for (const r of results)
          if (r.status === "fulfilled") expect(r.value.id).toBe(invoices[0].id);
      });

      it.each([DocumentType.INVOICE, DocumentType.ACT])(
        "two concurrent %s reissues leave exactly one live row next to the void one",
        async (type) => {
          const order = await confirmedOrder();
          const first = await generate(order, type);
          await promote(first);
          await asTenant(() => receipts.voidReceipt(first.id, user, "typo"));

          const results = await Promise.allSettled([
            generate(order, type),
            generate(order, type),
          ]);

          expect(results.map((r) => r.status)).toEqual([
            "fulfilled",
            "fulfilled",
          ]);
          const typed = (await rows(order)).filter(
            (r) => r.document_type === type,
          );
          const live = typed.filter((r) => r.status !== ReceiptStatus.VOID);
          expect(typed).toHaveLength(2);
          expect(live).toHaveLength(1);
          for (const r of results)
            if (r.status === "fulfilled") expect(r.value.id).toBe(live[0].id);
          expect(live[0].number).toBe(`${new Date().getUTCFullYear()}-000002`);
          expect(await counter(type)).toBe(2);
        },
      );

      it.each([DocumentType.INVOICE, DocumentType.ACT])(
        "two service instances without a shared mutex still leave one live %s",
        async (type) => {
          const order = await confirmedOrder();
          const other = buildReceipts();

          const results = await Promise.allSettled([
            asTenant(() =>
              receipts.generateDocument(order.id, user, type, KEEP),
            ),
            asTenant(() => other.generateDocument(order.id, user, type, KEEP)),
          ]);

          const typed = (await rows(order)).filter(
            (r) => r.document_type === type,
          );
          expect(typed).toHaveLength(1);
          expect(results.some((r) => r.status === "fulfilled")).toBe(true);
          for (const r of results) {
            if (r.status === "fulfilled") expect(r.value.id).toBe(typed[0].id);
            else
              expect(String((r.reason as Error).message)).not.toMatch(
                /duplicate key|violates/i,
              );
          }
        },
      );

      it("two service instances racing a reissue keep one live row next to the void one", async () => {
        const order = await confirmedOrder();
        const first = await generate(order, DocumentType.INVOICE);
        await promote(first);
        await asTenant(() => receipts.voidReceipt(first.id, user, "typo"));
        const other = buildReceipts();

        const results = await Promise.allSettled([
          generate(order, DocumentType.INVOICE),
          asTenant(() =>
            other.generateDocument(order.id, user, DocumentType.INVOICE, KEEP),
          ),
        ]);

        const typed = (await rows(order)).filter(
          (r) => r.document_type === DocumentType.INVOICE,
        );
        const live = typed.filter((r) => r.status !== ReceiptStatus.VOID);
        expect(typed).toHaveLength(2);
        expect(live).toHaveLength(1);
        for (const r of results)
          if (r.status === "rejected")
            expect(String((r.reason as Error).message)).not.toMatch(
              /duplicate key|violates/i,
            );
      });

      it("void racing a generate of the same type never leaves two live rows or a database error", async () => {
        const order = await confirmedOrder();
        const first = await generate(order, DocumentType.INVOICE);
        await promote(first);

        const results = await Promise.allSettled([
          asTenant(() => receipts.voidReceipt(first.id, user, "race")),
          generate(order, DocumentType.INVOICE),
        ]);

        const typed = (await rows(order)).filter(
          (r) => r.document_type === DocumentType.INVOICE,
        );
        const live = typed.filter((r) => r.status !== ReceiptStatus.VOID);
        // Either order is valid: generate saw the live invoice (nothing new), or the void
        // landed first and generate issued a replacement under the next number.
        expect(live.length).toBeLessThanOrEqual(1);
        expect(typed.length).toBeLessThanOrEqual(2);
        for (const r of results)
          if (r.status === "rejected")
            expect(String((r.reason as Error).message)).not.toMatch(
              /duplicate key|violates/i,
            );
        expect(results[0].status).toBe("fulfilled");
      });

      it("parallel invoices for different orders get distinct consecutive numbers", async () => {
        const list = [];
        for (let i = 0; i < 4; i++) list.push(await confirmedOrder());

        const made = await Promise.all(
          list.map((o) => generate(o, DocumentType.INVOICE)),
        );

        const numbers = made.map((r) => r.number).sort();
        expect(new Set(numbers).size).toBe(4);
        expect(await counter(DocumentType.INVOICE)).toBe(4);
      });

      it("a refused invoice does not move the counter even in parallel", async () => {
        await db.admin
          .getRepository(UserSettings)
          .update({ userId: user.id }, { companyIban: "" });
        const order = await confirmedOrder();

        const results = await Promise.allSettled([
          generate(order, DocumentType.INVOICE),
          generate(order, DocumentType.INVOICE),
        ]);

        for (const r of results) {
          expect(r.status).toBe("rejected");
          expect(
            ((r as PromiseRejectedResult).reason as ApiErrorResponse).errorCode,
          ).toBe("DOCUMENT_REQUISITES_MISSING");
        }
        expect(await counter(DocumentType.INVOICE)).toBe(0);
      });

      it("void while the invoice is being promoted leaves a consistent lock", async () => {
        const order = await confirmedOrder();
        const waybill = await generate(order, DocumentType.WAYBILL);
        await promote(waybill);
        const invoice = await generate(order, DocumentType.INVOICE);

        // Either side may lose the race; only the resulting lock state is asserted.
        await Promise.allSettled([
          promote(invoice),
          asTenant(() => receipts.voidReceipt(invoice.id, user, "race")),
        ]);

        const final = await stored(invoice.id);
        const locked = await isLocked(order);
        // The waybill is still generated, so the order must be locked either way.
        expect(locked).toBe(true);
        if (final.status === ReceiptStatus.VOID) {
          expect(
            (
              await db.admin
                .getRepository(Receipt)
                .findOneByOrFail({ id: invoice.id })
            ).status,
          ).toBe(ReceiptStatus.VOID);
        }
      });
    });
  },
);
