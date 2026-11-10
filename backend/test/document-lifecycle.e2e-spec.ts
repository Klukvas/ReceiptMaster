import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { Order } from "../src/modules/orders/entities/order.entity";
import {
  Currency,
  Product,
} from "../src/modules/products/entities/product.entity";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
import { UserSettings } from "../src/modules/settings/entities/user-settings.entity";
import { User } from "../src/modules/users/entities/user.entity";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { issueDateIn } from "../src/modules/receipts/frozen-document";
import {
  documentYear,
  nextDocumentNumber,
} from "../src/modules/receipts/receipt-number";
import { DEFAULT_DOCUMENT_TIME_ZONE } from "../src/modules/settings/document-config";
import { buildDocumentServices } from "./helpers/document-services";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";
import type { RestrictedAppDatabase } from "./helpers/restricted-app-database";

const KEEP = { logoAction: "keep" } as const;
const REAL_TIMERS = [
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
] as const;

/** Numbering, retention and return-note basis end to end on a migrated PostgreSQL. */
describeIsolatedPostgres(
  "document lifecycle fixes on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let services: ReturnType<typeof buildDocumentServices>;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_lifecycle");
      services = buildDocumentServices(db.app);
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@lifecycle.invalid`,
        password: "fixture",
      });
      recipient = await db.admin.getRepository(Recipient).save({
        name: "Іван Покупець",
        user_id: user.id,
      });
      await db.admin.getRepository(UserSettings).save({
        userId: user.id,
        companyName: "ТОВ Продавець",
        companyTaxId: "12345678",
        companyIban: "UA213223130000026007233566001",
        templateLanguage: "uk",
        companyVatPayer: false,
        companySignatoryName: "Петренко П.",
        companySignatoryPosition: "Директор",
      });
    });

    afterEach(() => jest.useRealTimers());

    const asTenant = <T>(work: () => Promise<T>): Promise<T> =>
      runWithTenant(user.id, work);

    const confirmedOrder = async (): Promise<Order> => {
      const product = await db.admin.getRepository(Product).save(
        db.admin.getRepository(Product).create({
          name: randomUUID(),
          user_id: user.id,
          purchase_price_cents: 100,
          sale_price_cents: 500,
          quantity: 100,
          currency: Currency.UAH,
        }),
      );
      const draft = (
        await asTenant(() =>
          services.orders.create(
            {
              recipientId: recipient.id,
              items: [{ productId: product.id, qty: 2 }],
            },
            user,
          ),
        )
      ).data as Order;
      return asTenant(() => services.orders.confirm(draft.id, user));
    };

    const generate = (
      order: Order,
      type: DocumentType,
      details?: Parameters<typeof services.receipts.generateDocument>[4],
    ) =>
      asTenant(() =>
        services.receipts.generateDocument(
          order.id,
          user,
          type,
          KEEP,
          details ??
            (type === DocumentType.INVOICE
              ? { paymentTermDays: 3 }
              : undefined),
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
        services.artifacts.execute(
          receipt.id,
          user.id,
          row.generation_id as string,
        ),
      );
    };

    const issueAndPromote = async (type: DocumentType, order?: Order) => {
      const receipt = await generate(order ?? (await confirmedOrder()), type);
      await promote(receipt);
      return receipt;
    };

    const rowCount = async (type: DocumentType, status?: ReceiptStatus) =>
      Number(
        (
          await db.admin.query(
            `SELECT COUNT(*) AS n FROM receipts WHERE user_id = $1 AND document_type = $2 ${
              status ? "AND status = $3" : ""
            }`,
            status ? [user.id, type, status] : [user.id, type],
          )
        )[0].n,
      );

    const counter = async (type: DocumentType) =>
      (
        await db.admin.query(
          `SELECT value FROM document_counters WHERE user_id = $1 AND document_type = $2`,
          [user.id, type],
        )
      )[0]?.value as number | undefined;

    describe("a counter behind the numbers already issued", () => {
      // The year as the app prints it: the calendar year in the document's zone (the
      // account has no zone of its own here), not the UTC year, which differs on New
      // Year's Eve after 22:00 UTC.
      let year: number;
      beforeEach(() => {
        year = documentYear(new Date(), DEFAULT_DOCUMENT_TIME_ZONE);
      });

      it("is repaired on the collision, never released into, and the generation retries once", async () => {
        const other = await confirmedOrder();
        const existing = await generate(other, DocumentType.INVOICE);
        expect(existing.number).toBe(`${year}-000001`);
        // Simulate a restored backup: the counter forgets two numbers that exist.
        await db.admin.query(`UPDATE receipts SET number = $2 WHERE id = $1`, [
          existing.id,
          `${year}-000003`,
        ]);
        await db.admin.query(
          `UPDATE document_counters SET value = 2 WHERE user_id = $1 AND document_type = 'invoice'`,
          [user.id],
        );

        // Draws 3, which is taken; the service raises the counter and draws 4.
        const created = await generate(
          await confirmedOrder(),
          DocumentType.INVOICE,
        );

        expect(created.number).toBe(`${year}-000004`);
        expect(await counter(DocumentType.INVOICE)).toBe(4);
        expect(
          (
            await db.admin.query(`SELECT number FROM receipts WHERE id = $1`, [
              existing.id,
            ])
          )[0].number,
        ).toBe(`${year}-000003`);
      });

      it("raises the waybill counter and users.receipt_counter together", async () => {
        const first = await generate(
          await confirmedOrder(),
          DocumentType.WAYBILL,
        );
        await db.admin.query(`UPDATE receipts SET number = $2 WHERE id = $1`, [
          first.id,
          `${year}-000010`,
        ]);
        await db.admin.query(
          `UPDATE document_counters SET value = 9 WHERE user_id = $1 AND document_type = 'waybill'`,
          [user.id],
        );
        await db.admin.query(
          `UPDATE users SET receipt_counter = 9 WHERE id = $1`,
          [user.id],
        );

        const second = await generate(
          await confirmedOrder(),
          DocumentType.WAYBILL,
        );

        expect(second.number).toBe(`${year}-000011`);
        expect(
          (
            await db.admin.query(
              `SELECT receipt_counter FROM users WHERE id = $1`,
              [user.id],
            )
          )[0].receipt_counter,
        ).toBe(11);
      });
    });

    describe("retention of ten per type", () => {
      it("a failed eleventh generation deletes nothing", async () => {
        for (let i = 0; i < 10; i++)
          await issueAndPromote(DocumentType.WAYBILL);
        expect(
          await rowCount(DocumentType.WAYBILL, ReceiptStatus.GENERATED),
        ).toBe(10);
        const order = await confirmedOrder();
        jest
          .spyOn(services.snapshots, "validatePrepared")
          .mockRejectedValueOnce(new ConflictException("Order changed"));

        await expect(generate(order, DocumentType.WAYBILL)).rejects.toThrow(
          "Order changed",
        );

        expect(await rowCount(DocumentType.WAYBILL)).toBe(10);
        expect(
          await rowCount(DocumentType.WAYBILL, ReceiptStatus.GENERATED),
        ).toBe(10);
      }, 60000);

      it("creating the eleventh row evicts nothing; promoting it evicts the oldest", async () => {
        const firsts: Receipt[] = [];
        for (let i = 0; i < 10; i++)
          firsts.push(await issueAndPromote(DocumentType.WAYBILL));
        const eleventh = await generate(
          await confirmedOrder(),
          DocumentType.WAYBILL,
        );
        expect(await rowCount(DocumentType.WAYBILL)).toBe(11);

        await promote(eleventh);

        expect(
          await rowCount(DocumentType.WAYBILL, ReceiptStatus.GENERATED),
        ).toBe(10);
        const remaining = (
          await db.admin.query(`SELECT id FROM receipts WHERE user_id = $1`, [
            user.id,
          ])
        ).map((row: { id: string }) => row.id);
        expect(remaining).not.toContain(firsts[0].id);
        expect(remaining).toContain(eleventh.id);
      }, 90000);

      it("never evicts an invoice, so its order cannot be invoiced twice", async () => {
        const orders: Order[] = [];
        for (let i = 0; i < 12; i++) {
          const order = await confirmedOrder();
          orders.push(order);
          await issueAndPromote(DocumentType.INVOICE, order);
        }

        expect(
          await rowCount(DocumentType.INVOICE, ReceiptStatus.GENERATED),
        ).toBe(12);
        await expect(
          generate(orders[0], DocumentType.INVOICE),
        ).rejects.toMatchObject({ errorCode: "DOCUMENT_ALREADY_EXISTS" });
        expect(await rowCount(DocumentType.INVOICE)).toBe(12);
      }, 90000);

      it("reports no document to be replaced for an invoice, act or return note", async () => {
        for (const type of [
          DocumentType.INVOICE,
          DocumentType.ACT,
          DocumentType.RETURN_NOTE,
        ])
          expect(
            (await asTenant(() => services.receipts.getRetention(user, type)))
              .replaces,
          ).toBeNull();
      });
    });

    describe("the year in a number follows the document's time zone", () => {
      it("draws 2027 at 31 December 22:30 UTC for Kyiv and 2026 for UTC", async () => {
        const at = new Date("2026-12-31T22:30:00Z");
        const draw = (timeZone: string) =>
          asTenant(() =>
            db.app.transaction(
              async (manager) =>
                (
                  await nextDocumentNumber(manager, user.id, DocumentType.ACT, {
                    timeZone,
                    now: at,
                  })
                ).number,
            ),
          );

        expect(await draw("Europe/Kyiv")).toBe("2027-000001");
        expect(await draw("UTC")).toBe("2026-000002");
      });

      it("issues a real invoice under that clock with 2027 in the number and the date", async () => {
        const order = await confirmedOrder();
        jest.useFakeTimers({
          now: new Date("2026-12-31T22:30:00Z"),
          doNotFake: [...REAL_TIMERS],
        });

        const invoice = await generate(order, DocumentType.INVOICE);

        expect(invoice.number).toBe("2027-000001");
        expect(
          (await stored(invoice.id)).pending_snapshot?.document?.issueDate,
        ).toBe("2027-01-01");
      });

      it.each([
        [null, "2027-000001"],
        ["UTC", "2026-000001"],
      ])(
        "previews the next number in the account's zone (config zone %p)",
        async (zone, expected) => {
          if (zone)
            await db.admin.query(
              `UPDATE user_settings SET document_config = $2::jsonb WHERE "userId" = $1`,
              [user.id, JSON.stringify({ formatting: { timeZone: zone } })],
            );
          jest.useFakeTimers({
            now: new Date("2026-12-31T22:30:00Z"),
            doNotFake: [...REAL_TIMERS],
          });

          const { types } = await asTenant(() =>
            services.numbering.list(user.id),
          );

          expect(
            types.find((t) => t.documentType === DocumentType.INVOICE)
              ?.nextNumber,
          ).toBe(expected);
        },
      );
    });

    describe("the basis of a goods return note", () => {
      const itemIds = async (order: Order) =>
        (
          await db.admin.query(
            `SELECT id FROM order_items WHERE order_id = $1 ORDER BY id`,
            [order.id],
          )
        ).map((row: { id: string }) => row.id) as string[];

      it("says what the source waybill's PDF says: its own title and the order date it prints", async () => {
        const order = await confirmedOrder();
        const waybill = await issueAndPromote(DocumentType.WAYBILL, order);
        const printed = (await stored(waybill.id)).active_snapshot;
        const [orderRow] = await db.admin.query(
          `SELECT created_at FROM orders WHERE id = $1`,
          [order.id],
        );
        // Age the row so that "the day the row was created" and "the order date" differ.
        await db.admin.query(
          `UPDATE receipts SET created_at = created_at + interval '5 days' WHERE id = $1`,
          [waybill.id],
        );

        const note = await generate(order, DocumentType.RETURN_NOTE, {
          lines: [{ orderItemId: (await itemIds(order))[0], qty: 1 }],
        });

        const source = (await stored(note.id)).pending_snapshot?.document
          ?.details.returnSource;
        expect(source).toMatchObject({
          kind: "waybill",
          number: waybill.number,
          title: printed?.publicProjection.companyInfo.receiptTitle,
          date: issueDateIn(
            new Date(printed?.order.created_at as string),
            printed?.config.formatting.timeZone as string,
          ),
        });
        expect(source?.title).toBeTruthy();
        expect(new Date(orderRow.created_at).getTime()).toBeLessThan(
          Date.now(),
        );
        const html = (
          await db.admin.query(
            `SELECT pending_html FROM receipts WHERE id = $1`,
            [note.id],
          )
        )[0].pending_html as string;
        expect(html).toContain(`${source?.title} №`);
      }, 30000);

      it("takes an invoice's heading and its frozen issue date, not a recomputed day", async () => {
        const order = await confirmedOrder();
        const invoice = await issueAndPromote(DocumentType.INVOICE, order);
        const frozen = (await stored(invoice.id)).active_snapshot?.document;
        // The row is dated far from the frozen issue date.
        await db.admin.query(
          `UPDATE receipts SET created_at = created_at - interval '40 days' WHERE id = $1`,
          [invoice.id],
        );

        const note = await generate(order, DocumentType.RETURN_NOTE, {
          lines: [{ orderItemId: (await itemIds(order))[0], qty: 1 }],
        });

        expect(
          (await stored(note.id)).pending_snapshot?.document?.details
            .returnSource,
        ).toMatchObject({
          kind: "invoice",
          number: invoice.number,
          title: frozen?.title,
          date: frozen?.issueDate,
        });
      }, 30000);
    });
  },
);
