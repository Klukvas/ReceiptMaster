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
  "generic document generation: invoice, act, sales receipt, packing list and waybill on PostgreSQL",
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

    const draftOrder = async (): Promise<Order> => {
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
      return (
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
    };

    const confirmedOrder = async (): Promise<Order> => {
      const draft = await draftOrder();
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

    describe("sales receipt and packing list", () => {
      it.each([DocumentType.SALES_RECEIPT, DocumentType.PACKING_LIST])(
        "%s is numbered on its own and locks the order",
        async (type) => {
          const order = await confirmedOrder();

          const first = await generate(order, type);

          expect(first.number).toBe(FIRST_NUMBER);
          expect(first.document_type).toBe(type);
          expect((await promote(first))?.status).toBe(ReceiptStatus.GENERATED);
          expect(await isLocked(order)).toBe(true);
          expect(await counter(type)).toBe(1);
          expect(await counter(DocumentType.WAYBILL)).toBe(0);

          await asTenant(() => receipts.voidReceipt(first.id, user, "t"));
          expect(await isLocked(order)).toBe(false);
        },
      );

      it("freezes the titles and no details", async () => {
        const order = await confirmedOrder();
        const receipt = await generate(order, DocumentType.SALES_RECEIPT);
        const packing = await generate(order, DocumentType.PACKING_LIST);

        expect(
          (await stored(receipt.id)).pending_snapshot?.document,
        ).toMatchObject({
          type: DocumentType.SALES_RECEIPT,
          title: "Товарний чек",
          details: {},
        });
        expect(
          (await stored(packing.id)).pending_snapshot?.document,
        ).toMatchObject({
          type: DocumentType.PACKING_LIST,
          title: "Пакувальний лист",
          details: {},
        });
      });

      it("needs only the seller's name", async () => {
        await db.admin.getRepository(UserSettings).update(
          { userId: user.id },
          {
            companyTaxId: "",
            companyIban: "",
            companyVatPayer: null,
            companyVatId: null,
            companySignatoryName: null,
          },
        );
        const order = await confirmedOrder();

        const receipt = await generate(order, DocumentType.SALES_RECEIPT);
        const packing = await generate(order, DocumentType.PACKING_LIST);

        expect(
          (await stored(receipt.id)).pending_snapshot?.document?.warnings,
        ).toEqual(["seller.taxId", "seller.vatPayer"]);
        expect(
          (await stored(packing.id)).pending_snapshot?.document?.warnings,
        ).toEqual([]);
      });

      it.each([DocumentType.SALES_RECEIPT, DocumentType.PACKING_LIST])(
        "%s answers 422 without a seller name and burns no number",
        async (type) => {
          await db.admin
            .getRepository(UserSettings)
            .update({ userId: user.id }, { companyName: "" });
          const order = await confirmedOrder();

          const error = (await rejection(
            generate(order, type),
          )) as ApiErrorResponse;

          expect(error.statusCode).toBe(422);
          expect(error.toJSON()).toMatchObject({
            errorCode: "DOCUMENT_REQUISITES_MISSING",
            fields: ["seller.name"],
          });
          expect(await counter(type)).toBe(0);
        },
      );

      it.each([DocumentType.SALES_RECEIPT, DocumentType.PACKING_LIST])(
        "%s refuses the thermal style without burning a number",
        async (type) => {
          await db.admin
            .getRepository(UserSettings)
            .update({ userId: user.id }, { templateId: "thermal" });
          const order = await confirmedOrder();

          expect(await rejection(generate(order, type))).toMatchObject({
            errorCode: "DOCUMENT_TEMPLATE_UNSUPPORTED",
          });
          expect(await counter(type)).toBe(0);
        },
      );

      it.each([DocumentType.SALES_RECEIPT, DocumentType.PACKING_LIST])(
        "%s answers 409 for a second document of the same type",
        async (type) => {
          const order = await confirmedOrder();
          await promote(await generate(order, type));

          expect(await rejection(generate(order, type))).toMatchObject({
            errorCode: "DOCUMENT_ALREADY_EXISTS",
            statusCode: 409,
          });
        },
      );

      it("refuses a draft order", async () => {
        const order = await confirmedOrder();
        await db.admin
          .getRepository(Order)
          .update({ id: order.id }, { status: OrderStatus.DRAFT });

        expect(
          await rejection(generate(order, DocumentType.PACKING_LIST)),
        ).toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });
      });

      it("shows no prices on the public link of a packing list, and does of a sales receipt", async () => {
        const order = await confirmedOrder();
        const publicOf = async (type: DocumentType) => {
          const receipt = await generate(order, type);
          await promote(receipt);
          const { token } = await asTenant(() =>
            receipts.generatePublicToken(receipt.id, user),
          );
          return JSON.stringify(await receipts.getPublicReceipt(token));
        };

        const packing = await publicOf(DocumentType.PACKING_LIST);
        expect(packing).not.toMatch(/price|total|_cents|"money":true/);
        expect(packing).toContain('"money":false');
        const sales = await publicOf(DocumentType.SALES_RECEIPT);
        expect(sales).toContain("_cents");
      });

      it("replaces a packing list in place with no prices in the new snapshot", async () => {
        const order = await confirmedOrder();
        const first = await generate(order, DocumentType.PACKING_LIST);
        await promote(first);

        await asTenant(() =>
          receipts.regenerateReceiptPdf(first.id, user, {
            mode: "replace",
            expectedActiveRevision: 1,
            confirmReconstruction: false,
            selection: KEEP,
          }),
        );

        const row = await stored(first.id);
        expect(row.number).toBe(first.number);
        expect(row.pending_snapshot?.document?.type).toBe(
          DocumentType.PACKING_LIST,
        );
        expect(
          JSON.stringify(row.pending_snapshot?.publicProjection),
        ).not.toMatch(/_cents/);
      });

      it("retries a failed sales receipt on the same row and number", async () => {
        const order = await confirmedOrder();
        const receipt = await generate(order, DocumentType.SALES_RECEIPT);
        await db.admin
          .getRepository(Receipt)
          .update({ id: receipt.id }, { status: ReceiptStatus.FAILED });

        const retried = await generate(order, DocumentType.SALES_RECEIPT);

        expect(retried.id).toBe(receipt.id);
        expect(retried.number).toBe(receipt.number);
        expect(await counter(DocumentType.SALES_RECEIPT)).toBe(1);
      });
    });

    describe("a retry of a failed document", () => {
      it("keeps the issue date, number and buyer of the first attempt even with an explicit configuration", async () => {
        const order = await confirmedOrder();
        const first = await generate(order, DocumentType.INVOICE, {
          paymentTermDays: 5,
        });
        // The first attempt happened on the last day of an earlier year.
        await db.admin.query(
          `UPDATE receipts SET status = 'failed',
             pending_snapshot = jsonb_set(pending_snapshot, '{document,issueDate}', '"2025-12-31"')
           WHERE id = $1`,
          [first.id],
        );

        const retried = await generate(order, DocumentType.INVOICE, {
          paymentTermDays: 10,
        });

        const row = await stored(retried.id);
        expect(retried.id).toBe(first.id);
        expect(retried.number).toBe(first.number);
        expect(row.pending_snapshot?.document).toMatchObject({
          issueDate: "2025-12-31",
          details: { dueDate: "2026-01-10" },
        });
        expect(await counter(DocumentType.INVOICE)).toBe(1);
      });

      it("freezes a custom act completion text and keeps it through a replacement", async () => {
        const order = await confirmedOrder();
        const act = await generate(order, DocumentType.ACT, {
          completionText: "Роботи прийнято без зауважень.",
        });
        const issued = await stored(act.id);
        expect(issued.pending_snapshot?.document?.details.completionText).toBe(
          "Роботи прийнято без зауважень.",
        );
        await promote(act);

        await asTenant(() =>
          receipts.regenerateReceiptPdf(act.id, user, {
            mode: "replace",
            expectedActiveRevision: 1,
            confirmReconstruction: false,
            selection: KEEP,
          }),
        );

        const replaced = await stored(act.id);
        expect(replaced.pending_snapshot?.document?.details).toMatchObject({
          completionText: "Роботи прийнято без зауважень.",
        });
        expect(replaced.pending_snapshot?.document?.issueDate).toBe(
          issued.pending_snapshot?.document?.issueDate,
        );
      });
    });

    describe("reissue after void", () => {
      it.each([DocumentType.INVOICE, DocumentType.ACT])(
        "a voided %s is replaced by a new one with the next number and the void row stays as history",
        async (type) => {
          const order = await confirmedOrder();
          const first = await generate(order, type);
          await promote(first);
          await asTenant(() => receipts.generatePublicToken(first.id, user));
          await asTenant(() => receipts.voidReceipt(first.id, user, "typo"));
          expect(await isLocked(order)).toBe(false);

          const second = await generate(order, type);

          expect(second.id).not.toBe(first.id);
          expect(first.number).toBe(FIRST_NUMBER);
          expect(second.number).toBe(`${new Date().getUTCFullYear()}-000002`);
          expect((await promote(second))?.status).toBe(ReceiptStatus.GENERATED);
          expect(await isLocked(order)).toBe(true);
          expect(await counter(type)).toBe(2);

          const history = await db.admin
            .getRepository(Receipt)
            .findOneByOrFail({ id: first.id });
          expect(history.status).toBe(ReceiptStatus.VOID);
          expect(history.number).toBe(FIRST_NUMBER);
          expect(history.pdf_path).toBeTruthy();
          expect(history.public_token).toBeNull();

          // The live row blocks a third one again; the void row never matters.
          expect(await rejection(generate(order, type))).toMatchObject({
            errorCode: "DOCUMENT_ALREADY_EXISTS",
            statusCode: 409,
          });
        },
      );

      it("a reissue can be voided and issued again, leaving every void row", async () => {
        const order = await confirmedOrder();
        for (let round = 1; round <= 3; round++) {
          const issued = await generate(order, DocumentType.INVOICE);
          await promote(issued);
          if (round < 3)
            await asTenant(() => receipts.voidReceipt(issued.id, user, "t"));
        }

        const invoices = await db.admin.getRepository(Receipt).find({
          where: { order_id: order.id, document_type: DocumentType.INVOICE },
          order: { number: "ASC" },
        });
        expect(invoices.map((r) => r.status)).toEqual([
          ReceiptStatus.VOID,
          ReceiptStatus.VOID,
          ReceiptStatus.GENERATED,
        ]);
      });

      it.each([
        DocumentType.WAYBILL,
        DocumentType.SALES_RECEIPT,
        DocumentType.PACKING_LIST,
      ])("a voided %s still cannot be issued again", async (type) => {
        const order = await confirmedOrder();
        const first = await generate(order, type);
        await promote(first);
        await asTenant(() => receipts.voidReceipt(first.id, user, "t"));

        expect(await rejection(generate(order, type))).toMatchObject({
          statusCode: 409,
        });
        expect(await counter(type)).toBe(1);
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

      it("refuses a return note without lines and unknown types through the controller", async () => {
        const order = await confirmedOrder();
        const controller = new ReceiptsController(receipts);
        const call = (type: string) =>
          rejection(
            asTenant(() =>
              controller.createDocument(order.id, { user }, { type }),
            ),
          );

        expect(await call("return_note")).toMatchObject({
          errorCode: "VALIDATION_ERROR",
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

    describe("quote", () => {
      const YEAR = new Date().getUTCFullYear();
      // Thirty days out in UTC is always inside the 14..365 window whatever the time zone.
      const inThirtyDays = new Date(Date.now() + 30 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const stateOf = async (id: string) =>
        db.admin.getRepository(Receipt).findOneByOrFail({ id });

      it("is issued on a draft order, promoted, and neither locks it nor blocks edits", async () => {
        const order = await draftOrder();

        const quote = await generate(order, DocumentType.QUOTE, {
          validUntil: inThirtyDays,
        });
        const promoted = await promote(quote);

        expect(quote.document_type).toBe(DocumentType.QUOTE);
        expect(quote.number).toBe(FIRST_NUMBER);
        expect(promoted?.status).toBe(ReceiptStatus.GENERATED);
        expect(await isLocked(order)).toBe(false);
        expect(await counter(DocumentType.QUOTE)).toBe(1);
        const row = await stored(quote.id);
        expect(row.active_snapshot?.document).toMatchObject({
          type: DocumentType.QUOTE,
          title: "Комерційна пропозиція",
        });
        const updated = await asTenant(() =>
          orders.update(order.id, { notes: "still editable" } as never, user),
        );
        expect(updated.id).toBe(order.id);
      });

      it("lets the order be confirmed and an invoice issued afterwards", async () => {
        const order = await draftOrder();
        await promote(await generate(order, DocumentType.QUOTE));

        await asTenant(() => orders.confirm(order.id, user));
        const invoice = await generate(order, DocumentType.INVOICE);

        expect(invoice.number).toBe(FIRST_NUMBER);
        expect((await promote(invoice))?.status).toBe(ReceiptStatus.GENERATED);
        expect(await isLocked(order)).toBe(true);
      });

      it("freezes the default validity of 14 days and the terms", async () => {
        const order = await draftOrder();
        const quote = await generate(order, DocumentType.QUOTE, {
          paymentTerms: "50% upfront",
          deliveryTerms: "Pickup",
        });

        const document = (await stored(quote.id)).pending_snapshot?.document;
        expect(document?.details).toMatchObject({
          validUntilSource: "default",
          paymentTerms: "50% upfront",
          deliveryTerms: "Pickup",
        });
        const days =
          (Date.parse(`${document?.details.validUntil}T00:00:00Z`) -
            Date.parse(`${document?.issueDate}T00:00:00Z`)) /
          86_400_000;
        expect(days).toBe(14);
      });

      it("is voided when a draft order is cancelled, with its link revoked", async () => {
        const order = await draftOrder();
        const quote = await generate(order, DocumentType.QUOTE);
        await promote(quote);
        await asTenant(() => receipts.generatePublicToken(quote.id, user));

        await asTenant(() => orders.cancel(order.id, user));

        const row = await stateOf(quote.id);
        expect(row.status).toBe(ReceiptStatus.VOID);
        expect(row.void_reason).toBe("order_cancelled");
        expect(row.public_token).toBeNull();
      });

      it("is refused for a cancelled order without burning a number", async () => {
        const order = await draftOrder();
        await asTenant(() => orders.cancel(order.id, user));

        expect(
          await rejection(generate(order, DocumentType.QUOTE)),
        ).toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });
        expect(await counter(DocumentType.QUOTE)).toBe(0);
      });

      it("refuses a validity before the issue date without burning a number", async () => {
        const order = await draftOrder();

        const error = (await rejection(
          generate(order, DocumentType.QUOTE, { validUntil: "2000-01-01" }),
        )) as ApiErrorResponse;

        expect(error.statusCode).toBe(400);
        expect(error.toJSON()).toMatchObject({
          errorCode: "VALIDATION_ERROR",
        });
        expect(await counter(DocumentType.QUOTE)).toBe(0);
      });

      it("refuses a validity beyond 365 days without burning a number", async () => {
        const order = await draftOrder();

        expect(
          await rejection(
            generate(order, DocumentType.QUOTE, { validUntil: "2999-01-01" }),
          ),
        ).toMatchObject({ errorCode: "VALIDATION_ERROR" });
        expect(await counter(DocumentType.QUOTE)).toBe(0);
      });

      it("a voided quote is reissued under the next number, both rows stay, and the live one blocks a third", async () => {
        const order = await draftOrder();
        const first = await generate(order, DocumentType.QUOTE);
        await promote(first);
        await asTenant(() => receipts.voidReceipt(first.id, user, "typo"));

        const second = await generate(order, DocumentType.QUOTE);
        await promote(second);

        expect(second.id).not.toBe(first.id);
        expect(second.number).toBe(`${YEAR}-000002`);
        expect((await stateOf(first.id)).status).toBe(ReceiptStatus.VOID);
        expect(
          await db.admin.getRepository(Receipt).countBy({
            order_id: order.id,
            document_type: DocumentType.QUOTE,
          }),
        ).toBe(2);
        expect(
          await rejection(generate(order, DocumentType.QUOTE)),
        ).toMatchObject({
          errorCode: "DOCUMENT_ALREADY_EXISTS",
          statusCode: 409,
        });
      });

      it("voiding a quote keeps the lock a waybill holds", async () => {
        const order = await confirmedOrder();
        const waybill = await generate(order, DocumentType.WAYBILL);
        await promote(waybill);
        const quote = await generate(order, DocumentType.QUOTE);
        await promote(quote);
        expect(await isLocked(order)).toBe(true);

        await asTenant(() => receipts.voidReceipt(quote.id, user, "t"));

        expect(await isLocked(order)).toBe(true);
      });

      it("repairs the file of a quote on a draft order", async () => {
        const order = await draftOrder();
        const quote = await generate(order, DocumentType.QUOTE);
        await promote(quote);

        const buffer = await asTenant(() =>
          artifacts.repair(quote.id, user.id),
        );

        expect(buffer.equals(FIXTURE_PDF)).toBe(true);
      });

      it("a replacement keeps the issue date and the validity", async () => {
        const order = await draftOrder();
        const quote = await generate(order, DocumentType.QUOTE, {
          validUntil: inThirtyDays,
          paymentTerms: "Prepay",
        });
        await promote(quote);
        const before = (await stored(quote.id)).active_snapshot?.document;

        await asTenant(() =>
          receipts.regenerateReceiptPdf(quote.id, user, {
            mode: "replace",
            expectedActiveRevision: 1,
            confirmReconstruction: false,
            selection: KEEP,
          }),
        );

        const after = (await stored(quote.id)).pending_snapshot?.document;
        expect(after?.issueDate).toBe(before?.issueDate);
        expect(after?.details).toEqual(before?.details);
        expect(after?.details.paymentTerms).toBe("Prepay");
      });

      it("eleven quotes do not push out invoices", async () => {
        const invoice = await generate(
          await confirmedOrder(),
          DocumentType.INVOICE,
        );
        await promote(invoice);
        for (let i = 0; i < 11; i++) {
          const quote = await generate(await draftOrder(), DocumentType.QUOTE);
          await promote(quote);
        }

        expect((await stateOf(invoice.id)).status).toBe(
          ReceiptStatus.GENERATED,
        );
        expect(
          await db.admin.getRepository(Receipt).countBy({
            user_id: user.id,
            document_type: DocumentType.QUOTE,
            status: ReceiptStatus.GENERATED,
          }),
        ).toBe(10);
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
