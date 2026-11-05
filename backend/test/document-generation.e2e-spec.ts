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
  "generic document generation: invoice, act and waybill on PostgreSQL",
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
      db = await openMigratedAppDatabase(connection, "audit_docgen");
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

    describe("three documents on one confirmed order", () => {
      it("numbers each type on its own and locks the order until the last one is voided", async () => {
        const order = await confirmedOrder();

        const invoice = await generate(order, DocumentType.INVOICE);
        const act = await generate(order, DocumentType.ACT);
        const waybill = await generate(order, DocumentType.WAYBILL);

        expect([invoice.number, act.number, waybill.number]).toEqual([
          FIRST_NUMBER,
          FIRST_NUMBER,
          FIRST_NUMBER,
        ]);
        expect([invoice, act, waybill].map((r) => r.document_type)).toEqual([
          DocumentType.INVOICE,
          DocumentType.ACT,
          DocumentType.WAYBILL,
        ]);
        for (const receipt of [invoice, act, waybill])
          expect((await promote(receipt))?.status).toBe(
            ReceiptStatus.GENERATED,
          );
        expect(await isLocked(order)).toBe(true);

        await asTenant(() => receipts.voidReceipt(invoice.id, user, "t"));
        expect(await isLocked(order)).toBe(true);
        await asTenant(() => receipts.voidReceipt(act.id, user, "t"));
        expect(await isLocked(order)).toBe(true);
        await asTenant(() => receipts.voidReceipt(waybill.id, user, "t"));
        expect(await isLocked(order)).toBe(false);
      });

      it("freezes title, seller, buyer and due date in the invoice, and nothing for a waybill", async () => {
        const order = await confirmedOrder();
        const invoice = await generate(order, DocumentType.INVOICE, {
          paymentTermDays: 7,
        });
        const waybill = await generate(order, DocumentType.WAYBILL);

        const frozen = (await stored(invoice.id)).pending_snapshot?.document;
        expect(frozen).toMatchObject({
          type: DocumentType.INVOICE,
          title: "Рахунок на оплату",
          seller: { iban: SELLER_IBAN, vatId: VAT_ID, taxIdKind: "edrpou" },
          buyer: { legalName: "ТОВ Покупець", iban: BUYER_IBAN },
          details: { dueDateSource: "request_days" },
        });
        expect(
          (await stored(waybill.id)).pending_snapshot as object,
        ).not.toHaveProperty("document");
      });
    });

    describe("refusals", () => {
      it.each([OrderStatus.DRAFT, OrderStatus.CANCELLED])(
        "refuses an invoice for a %s order without burning a number",
        async (status) => {
          const order = await confirmedOrder();
          await db.admin
            .getRepository(Order)
            .update({ id: order.id }, { status });

          const error = await rejection(generate(order, DocumentType.INVOICE));

          expect(error).toMatchObject({
            errorCode: "ORDER_CANNOT_BE_MODIFIED",
          });
          expect(await counter(DocumentType.INVOICE)).toBe(0);
        },
      );

      it("answers 422 with the missing fields and leaves the counter alone", async () => {
        await db.admin
          .getRepository(UserSettings)
          .update({ userId: user.id }, { companyIban: "" });
        const order = await confirmedOrder();

        const error = (await rejection(
          generate(order, DocumentType.INVOICE),
        )) as ApiErrorResponse;

        expect(error.statusCode).toBe(422);
        expect(error.toJSON()).toMatchObject({
          errorCode: "DOCUMENT_REQUISITES_MISSING",
          fields: ["seller.iban"],
        });
        expect(await counter(DocumentType.INVOICE)).toBe(0);
        expect(
          await db.admin.getRepository(Receipt).countBy({ order_id: order.id }),
        ).toBe(0);
      });

      it("refuses a style that cannot carry an invoice without burning a number", async () => {
        await db.admin
          .getRepository(UserSettings)
          .update({ userId: user.id }, { templateId: "compact" });
        const order = await confirmedOrder();

        const error = await rejection(generate(order, DocumentType.INVOICE));

        expect(error).toMatchObject({
          errorCode: "DOCUMENT_TEMPLATE_UNSUPPORTED",
        });
        expect(await counter(DocumentType.INVOICE)).toBe(0);
      });

      it("refuses an act without a signatory", async () => {
        await db.admin
          .getRepository(UserSettings)
          .update({ userId: user.id }, { companySignatoryName: null });
        const order = await confirmedOrder();

        const error = (await rejection(
          generate(order, DocumentType.ACT),
        )) as ApiErrorResponse;

        expect(error.toJSON().fields).toEqual(["seller.signatoryName"]);
        expect(await counter(DocumentType.ACT)).toBe(0);
      });

      it("refuses unsupported and unknown types through the controller", async () => {
        const order = await confirmedOrder();
        const controller = new ReceiptsController(receipts);
        const call = (type: string) =>
          rejection(
            asTenant(() =>
              controller.createDocument(order.id, { user }, { type }),
            ),
          );

        expect(await call("quote")).toMatchObject({
          errorCode: "DOCUMENT_TYPE_NOT_SUPPORTED",
        });
        expect(await call("return_note")).toMatchObject({
          errorCode: "DOCUMENT_TYPE_NOT_SUPPORTED",
        });
        expect(await call("receipt")).toMatchObject({
          errorCode: "VALIDATION_ERROR",
        });
      });

      it("answers 409 for a second invoice, and keeps the waybill's old error", async () => {
        const order = await confirmedOrder();
        await generate(order, DocumentType.INVOICE);
        await generate(order, DocumentType.WAYBILL);
        const invoice = await db.admin.getRepository(Receipt).findOneByOrFail({
          order_id: order.id,
          document_type: DocumentType.INVOICE,
        });
        await promote(invoice);

        expect(
          await rejection(generate(order, DocumentType.INVOICE)),
        ).toMatchObject({
          errorCode: "DOCUMENT_ALREADY_EXISTS",
          statusCode: 409,
        });
        const waybillRow = await db.admin
          .getRepository(Receipt)
          .findOneByOrFail({
            order_id: order.id,
            document_type: DocumentType.WAYBILL,
          });
        await promote(waybillRow);
        expect(
          await rejection(generate(order, DocumentType.WAYBILL)),
        ).toMatchObject({
          errorCode: "RECEIPT_ALREADY_EXISTS",
        });
      });

      it("returns the existing row for a repeated request while it is processing", async () => {
        const order = await confirmedOrder();
        const first = await generate(order, DocumentType.ACT);
        const again = await generate(order, DocumentType.ACT);
        expect(again.id).toBe(first.id);
        expect(await counter(DocumentType.ACT)).toBe(1);
      });
    });

    describe("retention is per type", () => {
      it("an invoice next to ten generated waybills evicts nothing", async () => {
        for (let i = 0; i < 10; i++) {
          const order = await confirmedOrder();
          await db.admin.getRepository(Receipt).save({
            user_id: user.id,
            order_id: order.id,
            number: `W-${i}`,
            document_type: DocumentType.WAYBILL,
            status: ReceiptStatus.GENERATED,
          });
        }
        const order = await confirmedOrder();

        await generate(order, DocumentType.INVOICE);

        expect(
          await db.admin.getRepository(Receipt).countBy({
            user_id: user.id,
            document_type: DocumentType.WAYBILL,
            status: ReceiptStatus.GENERATED,
          }),
        ).toBe(10);
        const invoiceRetention = await asTenant(() =>
          receipts.getRetention(user, DocumentType.INVOICE),
        );
        expect(invoiceRetention.count).toBe(0);
      });

      it("lists documents by type", async () => {
        const order = await confirmedOrder();
        await generate(order, DocumentType.INVOICE);
        await generate(order, DocumentType.ACT);

        const invoices = await asTenant(() =>
          receipts.findAll(user, { type: DocumentType.INVOICE }),
        );

        expect(invoices.data.map((r) => r.document_type)).toEqual([
          DocumentType.INVOICE,
        ]);
      });
    });

    describe("public projection", () => {
      it("shows the seller's IBAN but never the buyer's requisites, the VAT id or the signatory", async () => {
        const order = await confirmedOrder();
        const invoice = await generate(order, DocumentType.INVOICE);
        await promote(invoice);
        const { token } = await asTenant(() =>
          receipts.generatePublicToken(invoice.id, user),
        );

        const publicView = JSON.stringify(
          await receipts.getPublicReceipt(token),
        );

        expect(publicView).toContain(SELLER_IBAN);
        expect(publicView).toContain("Рахунок на оплату");
        for (const secret of [BUYER_IBAN, BUYER_TAX_ID, VAT_ID, SIGNATORY])
          expect(publicView).not.toContain(secret);
      });
    });

    describe("changes while a document is being prepared", () => {
      it("rejects the commit when the buyer's IBAN changed after prepare", async () => {
        const order = await confirmedOrder();
        const request = {
          type: DocumentType.INVOICE as const,
          details: {},
        };
        const prepared = await asTenant(() =>
          snapshots.prepare(
            user.id,
            order.id,
            "N-1",
            KEEP,
            undefined,
            undefined,
            request,
          ),
        );
        await db.admin
          .getRepository(Recipient)
          .update(
            { id: recipient.id },
            { iban: "UA000000000000000000000000000" },
          );

        const error = await rejection(
          asTenant(() =>
            db.app.transaction((manager) =>
              snapshots.validatePrepared(user.id, order.id, prepared, manager),
            ),
          ),
        );

        expect(error).toBeInstanceOf(ConflictException);
      });

      it("rejects the commit when the seller's requisites changed after prepare", async () => {
        const order = await confirmedOrder();
        const prepared = await asTenant(() =>
          snapshots.prepare(
            user.id,
            order.id,
            "N-2",
            KEEP,
            undefined,
            undefined,
            {
              type: DocumentType.ACT,
              details: {},
            },
          ),
        );
        await db.admin
          .getRepository(UserSettings)
          .update({ userId: user.id }, { companySignatoryPosition: null });

        const error = await rejection(
          asTenant(() =>
            db.app.transaction((manager) =>
              snapshots.validatePrepared(user.id, order.id, prepared, manager),
            ),
          ),
        );

        expect(error).toMatchObject({
          errorCode: "DOCUMENT_REQUISITES_MISSING",
        });
      });
    });

    describe("replacement and retry keep the buyer", () => {
      it("a replacement keeps the buyer, issue date and due date, and rebuilds the seller", async () => {
        const order = await confirmedOrder();
        const invoice = await generate(order, DocumentType.INVOICE, {
          paymentTermDays: 7,
        });
        await promote(invoice);
        const before = (await stored(invoice.id)).active_snapshot?.document;
        await db.admin
          .getRepository(Recipient)
          .update({ id: recipient.id }, { legal_name: "ТОВ Нова назва" });
        await db.admin
          .getRepository(UserSettings)
          .update({ userId: user.id }, { companyBankName: "Банк" });

        await asTenant(() =>
          receipts.regenerateReceiptPdf(invoice.id, user, {
            mode: "replace",
            expectedActiveRevision: 1,
            confirmReconstruction: false,
            selection: KEEP,
          }),
        );

        const after = (await stored(invoice.id)).pending_snapshot?.document;
        expect(after?.buyer.legalName).toBe("ТОВ Покупець");
        expect(after?.issueDate).toBe(before?.issueDate);
        expect(after?.details).toEqual(before?.details);
        expect(after?.seller.bankName).toBe("Банк");
      });

      it("a failed invoice retried with new details is rebuilt on the frozen buyer", async () => {
        const order = await confirmedOrder();
        const invoice = await generate(order, DocumentType.INVOICE, {
          paymentTermDays: 7,
        });
        await db.admin
          .getRepository(Receipt)
          .update({ id: invoice.id }, { status: ReceiptStatus.FAILED });
        await db.admin
          .getRepository(Recipient)
          .update({ id: recipient.id }, { legal_name: "ТОВ Нова назва" });

        const retried = await generate(order, DocumentType.INVOICE, {
          paymentTermDays: 3,
        });

        expect(retried.id).toBe(invoice.id);
        expect(retried.number).toBe(invoice.number);
        const frozen = (await stored(invoice.id)).pending_snapshot?.document;
        expect(frozen?.buyer.legalName).toBe("ТОВ Покупець");
        expect(frozen?.details.dueDateSource).toBe("request_days");
        expect(await counter(DocumentType.INVOICE)).toBe(1);
      });
    });
  },
);
