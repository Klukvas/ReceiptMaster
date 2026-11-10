import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ApiErrorResponse } from "../src/common/errors/ApiError";
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
  nextDocumentNumber,
  raiseCounterToIssued,
  releaseDocumentNumber,
} from "../src/modules/receipts/receipt-number";
import { UpdateNumberingDto } from "../src/modules/receipts/dto/update-numbering.dto";
import {
  DocumentType,
  Receipt,
} from "../src/modules/receipts/entities/receipt.entity";
import { buildDocumentServices } from "./helpers/document-services";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";
import type { RestrictedAppDatabase } from "./helpers/restricted-app-database";

const YEAR = new Date().getUTCFullYear();
const KEEP = { logoAction: "keep" } as const;

const format = (
  overrides: Partial<UpdateNumberingDto> = {},
): UpdateNumberingDto =>
  Object.assign(new UpdateNumberingDto(), {
    prefix: "",
    padding: 6,
    includeYear: true,
    ...overrides,
  });

/** Document numbering settings on a migrated PostgreSQL, through the real services. */
describeIsolatedPostgres(
  "document numbering on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let services: ReturnType<typeof buildDocumentServices>;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_docnum");
      services = buildDocumentServices(db.app);
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@numbering.invalid`,
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

    const asTenant = <T>(work: () => Promise<T>, tenant = user): Promise<T> =>
      runWithTenant(tenant.id, work);

    const setFormat = (
      type: DocumentType,
      overrides: Partial<UpdateNumberingDto>,
    ) =>
      asTenant(() =>
        services.numbering.update(user.id, type, format(overrides)),
      );

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
              items: [{ productId: product.id, qty: 1 }],
            },
            user,
          ),
        )
      ).data as Order;
      return asTenant(() => services.orders.confirm(draft.id, user));
    };

    const generate = async (type: DocumentType): Promise<Receipt> =>
      asTenant(async () =>
        services.receipts.generateDocument(
          (await confirmedOrder()).id,
          user,
          type,
          KEEP,
          type === DocumentType.INVOICE ? { paymentTermDays: 3 } : undefined,
        ),
      );

    const counterRow = async (type: DocumentType) =>
      (
        await db.admin.query(
          `SELECT value, prefix, padding, include_year FROM document_counters
           WHERE user_id = $1 AND document_type = $2`,
          [user.id, type],
        )
      )[0];

    it("lists all seven types with the historical default for an untouched account", async () => {
      const { types } = await asTenant(() => services.numbering.list(user.id));

      expect(types.map((t) => t.documentType).sort()).toEqual(
        Object.values(DocumentType).sort(),
      );
      for (const setting of types)
        expect(setting).toEqual({
          documentType: setting.documentType,
          prefix: "",
          padding: 6,
          includeYear: true,
          resetEveryYear: false,
          nextValue: 1,
          minStart: 1,
          nextNumber: `${YEAR}-000001`,
        });
    });

    it("keeps an existing account's numbers byte for byte as they were", async () => {
      const first = await generate(DocumentType.INVOICE);
      const second = await generate(DocumentType.INVOICE);

      expect([first.number, second.number]).toEqual([
        `${YEAR}-000001`,
        `${YEAR}-000002`,
      ]);
    });

    it("issues the next document in the saved format, from the saved start", async () => {
      const saved = await setFormat(DocumentType.INVOICE, {
        prefix: "РФ-",
        padding: 4,
        startNumber: 43,
      });

      expect(saved).toMatchObject({
        prefix: "РФ-",
        nextValue: 43,
        minStart: 43,
        nextNumber: `РФ-${YEAR}-0043`,
      });
      const invoice = await generate(DocumentType.INVOICE);
      expect(invoice.number).toBe(`РФ-${YEAR}-0043`);
      // Other types keep counting on their own, in their own format.
      expect((await generate(DocumentType.ACT)).number).toBe(`${YEAR}-000001`);
      expect(
        (await asTenant(() => services.numbering.list(user.id))).types.find(
          (t) => t.documentType === DocumentType.INVOICE,
        ),
      ).toMatchObject({ nextValue: 44, nextNumber: `РФ-${YEAR}-0044` });
    });

    it("can drop the year and the prefix", async () => {
      await setFormat(DocumentType.INVOICE, {
        prefix: "INV",
        padding: 3,
        includeYear: false,
      });
      expect((await generate(DocumentType.INVOICE)).number).toBe("INV-001");
    });

    it("refuses a start below a number already used and reports the minimum", async () => {
      await generate(DocumentType.INVOICE);
      await generate(DocumentType.INVOICE);

      const refusal = await setFormat(DocumentType.INVOICE, {
        startNumber: 2,
      }).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ApiErrorResponse);
      expect(refusal).toMatchObject({
        statusCode: 409,
        errorCode: "NUMBERING_START_TOO_LOW",
        details: { minStart: 3 },
      });
      // Nothing was saved, not even the format.
      expect((await counterRow(DocumentType.INVOICE)).value).toBe(2);
    });

    it("accepts exactly the minimum and never lowers the counter", async () => {
      await generate(DocumentType.INVOICE);
      await setFormat(DocumentType.INVOICE, { startNumber: 2, prefix: "A-" });
      expect((await counterRow(DocumentType.INVOICE)).value).toBe(1);
      // Saving the format alone does not touch the counter either.
      await setFormat(DocumentType.INVOICE, { prefix: "B-" });
      expect((await counterRow(DocumentType.INVOICE)).value).toBe(1);
      expect((await generate(DocumentType.INVOICE)).number).toBe(
        `B-${YEAR}-000002`,
      );
    });

    it("gives every parallel generation its own number while the prefix changes underneath", async () => {
      const orders = await Promise.all(
        Array.from({ length: 6 }, () => confirmedOrder()),
      );
      const prefixes = ["A-", "B-", "C-", "D-", "E-", "F-"];

      const settled = await Promise.allSettled([
        ...orders.map((order) =>
          asTenant(() =>
            services.receipts.generateDocument(
              order.id,
              user,
              DocumentType.INVOICE,
              KEEP,
              { paymentTermDays: 3 },
            ),
          ),
        ),
        ...prefixes.map((prefix) =>
          setFormat(DocumentType.INVOICE, { prefix }),
        ),
      ]);

      expect(settled.filter((result) => result.status === "rejected")).toEqual(
        [],
      );
      const numbers = (
        await db.admin.query(
          `SELECT number FROM receipts WHERE user_id = $1 AND document_type = 'invoice'`,
          [user.id],
        )
      ).map((row: { number: string }) => row.number);
      expect(numbers).toHaveLength(6);
      expect(new Set(numbers).size).toBe(6);
      // Each number is whole in one format: a prefix and the year, never a mix.
      for (const number of numbers)
        expect(number).toMatch(new RegExp(`^([A-F]-)?${YEAR}-\\d{6}$`));
      // The values 1..6 were each used exactly once.
      expect(numbers.map((n: string) => Number(n.slice(-6))).sort()).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
    });

    it("hands the number back when generation fails after the draw, whatever its format", async () => {
      await setFormat(DocumentType.INVOICE, { prefix: "РФ-", startNumber: 10 });
      const order = await confirmedOrder();
      const failure = new ConflictException("Order changed");
      jest
        .spyOn(services.snapshots, "validatePrepared")
        .mockRejectedValueOnce(failure);

      await expect(
        asTenant(() =>
          services.receipts.generateDocument(
            order.id,
            user,
            DocumentType.INVOICE,
            KEEP,
            { paymentTermDays: 3 },
          ),
        ),
      ).rejects.toBe(failure);

      expect((await counterRow(DocumentType.INVOICE)).value).toBe(9);
      expect(
        (
          await asTenant(() =>
            services.receipts.generateDocument(
              order.id,
              user,
              DocumentType.INVOICE,
              KEEP,
              { paymentTermDays: 3 },
            ),
          )
        ).number,
      ).toBe(`РФ-${YEAR}-000010`);
    });

    it("numbers a reissued invoice in the format that applies now", async () => {
      const order = await confirmedOrder();
      const first = await asTenant(() =>
        services.receipts.generateDocument(
          order.id,
          user,
          DocumentType.INVOICE,
          KEEP,
          {
            paymentTermDays: 3,
          },
        ),
      );
      await asTenant(() =>
        services.receipts.voidReceipt(first.id, user, "mistake"),
      );
      await setFormat(DocumentType.INVOICE, { prefix: "НОВ-" });

      const reissued = await asTenant(() =>
        services.receipts.generateDocument(
          order.id,
          user,
          DocumentType.INVOICE,
          KEEP,
          {
            paymentTermDays: 3,
          },
        ),
      );

      expect(first.number).toBe(`${YEAR}-000001`);
      expect(reissued.number).toBe(`НОВ-${YEAR}-000002`);
    });

    describe("waybill and the legacy users counter", () => {
      it("raises users.receipt_counter along with the waybill counter", async () => {
        await setFormat(DocumentType.WAYBILL, { startNumber: 100 });

        expect(
          (
            await db.admin.query(
              `SELECT receipt_counter FROM users WHERE id = $1`,
              [user.id],
            )
          )[0].receipt_counter,
        ).toBe(99);
        expect((await generate(DocumentType.WAYBILL)).number).toBe(
          `${YEAR}-000100`,
        );
      });

      it("counts from the higher of the two counters when an older image ran in between", async () => {
        await generate(DocumentType.WAYBILL);
        // The older image only ever writes users.receipt_counter.
        await db.admin.query(
          `UPDATE users SET receipt_counter = 20 WHERE id = $1`,
          [user.id],
        );

        const waybill = (
          await asTenant(() => services.numbering.list(user.id))
        ).types.find((t) => t.documentType === DocumentType.WAYBILL);
        expect(waybill).toMatchObject({ nextValue: 21, minStart: 21 });

        const refusal = await setFormat(DocumentType.WAYBILL, {
          startNumber: 10,
        }).catch((error: unknown) => error);
        expect(refusal).toMatchObject({
          errorCode: "NUMBERING_START_TOO_LOW",
          details: { minStart: 21 },
        });
        expect((await generate(DocumentType.WAYBILL)).number).toBe(
          `${YEAR}-000021`,
        );
      });

      it("does not touch users.receipt_counter for other types", async () => {
        await setFormat(DocumentType.INVOICE, { startNumber: 500 });
        expect(
          (
            await db.admin.query(
              `SELECT receipt_counter FROM users WHERE id = $1`,
              [user.id],
            )
          )[0].receipt_counter,
        ).toBe(0);
      });
    });

    it("keeps one account's format and counters out of reach of another", async () => {
      await setFormat(DocumentType.INVOICE, {
        prefix: "MINE-",
        startNumber: 77,
      });
      const other = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@numbering.invalid`,
        password: "fixture",
      });

      const theirs = await asTenant(
        () => services.numbering.list(other.id),
        other,
      );
      expect(
        theirs.types.find((t) => t.documentType === DocumentType.INVOICE),
      ).toMatchObject({ prefix: "", nextValue: 1 });
      // Asking for a row of the first account while acting as the other one finds nothing.
      const crossed = await asTenant(
        () => services.numbering.list(user.id),
        other,
      );
      expect(
        crossed.types.find((t) => t.documentType === DocumentType.INVOICE),
      ).toMatchObject({ prefix: "", nextValue: 1 });
    });

    describe("yearly reset", () => {
      const KYIV = "Europe/Kyiv";
      const inYear = (year: number) => new Date(`${year}-06-15T12:00:00Z`);
      const draw = (type: DocumentType, now: Date) =>
        asTenant(() =>
          nextDocumentNumber(db.app.manager, user.id, type, {
            timeZone: KYIV,
            now,
          }),
        );
      const yearRows = (type: DocumentType) =>
        db.admin.query(
          `SELECT year, value FROM document_year_counters
           WHERE user_id = $1 AND document_type = $2 ORDER BY year`,
          [user.id, type],
        );
      const issue = async (number: string, type = DocumentType.INVOICE) => {
        const order = await confirmedOrder();
        await db.admin.query(
          `INSERT INTO receipts (id, order_id, number, user_id, document_type) VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), order.id, number, user.id, type],
        );
      };

      it("changes nothing while the switch is off: no yearly rows, one flat counter across years", async () => {
        expect((await draw(DocumentType.INVOICE, inYear(YEAR))).number).toBe(
          `${YEAR}-000001`,
        );
        expect(
          (await draw(DocumentType.INVOICE, inYear(YEAR + 1))).number,
        ).toBe(`${YEAR + 1}-000002`);
        expect(await yearRows(DocumentType.INVOICE)).toEqual([]);
      });

      it("continues the numbers already issued this year, then restarts at one in the next", async () => {
        await generate(DocumentType.INVOICE);
        await generate(DocumentType.INVOICE);

        const saved = await setFormat(DocumentType.INVOICE, {
          resetEveryYear: true,
        });
        expect(saved).toMatchObject({
          resetEveryYear: true,
          nextValue: 3,
          minStart: 3,
          nextNumber: `${YEAR}-000003`,
        });

        const numbers = [
          (await draw(DocumentType.INVOICE, inYear(YEAR))).number,
          (await draw(DocumentType.INVOICE, inYear(YEAR + 1))).number,
          (await draw(DocumentType.INVOICE, inYear(YEAR + 1))).number,
          (await draw(DocumentType.INVOICE, inYear(YEAR))).number,
        ];
        expect(numbers).toEqual([
          `${YEAR}-000003`,
          `${YEAR + 1}-000001`,
          `${YEAR + 1}-000002`,
          `${YEAR}-000004`,
        ]);
        // The flat counter stays where it was: it is not used while the switch is on.
        expect((await counterRow(DocumentType.INVOICE)).value).toBe(2);
      });

      it("takes the year in the document's time zone at the border", async () => {
        await setFormat(DocumentType.ACT, { resetEveryYear: true });
        const lateKyiv = new Date(`${YEAR}-12-31T22:30:00Z`); // already next year in Kyiv
        const earlyKyiv = new Date(`${YEAR}-12-31T21:30:00Z`);
        expect((await draw(DocumentType.ACT, earlyKyiv)).number).toBe(
          `${YEAR}-000001`,
        );
        expect((await draw(DocumentType.ACT, lateKyiv)).number).toBe(
          `${YEAR + 1}-000001`,
        );
      });

      it("gives every parallel draw across the border of the year its own number, with no gaps", async () => {
        await setFormat(DocumentType.QUOTE, { resetEveryYear: true });
        const before = new Date(`${YEAR}-12-31T21:30:00Z`);
        const after = new Date(`${YEAR}-12-31T22:30:00Z`);

        const drawn = await Promise.all(
          Array.from({ length: 24 }, (_, index) =>
            draw(DocumentType.QUOTE, index % 2 === 0 ? before : after),
          ),
        );

        const numbers = drawn.map((entry) => entry.number);
        expect(new Set(numbers).size).toBe(24);
        const valuesOf = (year: number) =>
          drawn
            .filter((entry) => entry.year === year)
            .map((entry) => entry.value)
            .sort((a, b) => a - b);
        const expected = Array.from({ length: 12 }, (_, index) => index + 1);
        expect(valuesOf(YEAR)).toEqual(expected);
        expect(valuesOf(YEAR + 1)).toEqual(expected);
        expect(await yearRows(DocumentType.QUOTE)).toEqual([
          { year: YEAR, value: 12 },
          { year: YEAR + 1, value: 12 },
        ]);
      });

      it("hands a number back to its own year, and only while it is the latest", async () => {
        await setFormat(DocumentType.INVOICE, { resetEveryYear: true });
        const first = await draw(DocumentType.INVOICE, inYear(YEAR + 2));
        const release = (value: number) =>
          asTenant(() =>
            releaseDocumentNumber(
              db.app.manager,
              user.id,
              DocumentType.INVOICE,
              value,
              YEAR + 2,
            ),
          );

        expect(await release(first.value)).toBe(true);
        expect(
          (await draw(DocumentType.INVOICE, inYear(YEAR + 2))).number,
        ).toBe(first.number);
        const second = await draw(DocumentType.INVOICE, inYear(YEAR + 2));
        expect(await release(first.value)).toBe(false);
        expect(second.value).toBe(2);
      });

      it("starts a new year above numbers already issued in it, even by hand", async () => {
        await setFormat(DocumentType.INVOICE, { resetEveryYear: true });
        await issue(`${YEAR + 3}-000050`);
        await issue(`A${YEAR + 3}-000049`);
        await issue(`${YEAR + 4}-000900`);

        expect(
          (await draw(DocumentType.INVOICE, inYear(YEAR + 3))).number,
        ).toBe(`${YEAR + 3}-000051`);
      });

      it("ignores hand-made numbers that are not a year and a counter value", async () => {
        await setFormat(DocumentType.INVOICE, { resetEveryYear: true });
        await issue("ABC");
        await issue(`${YEAR + 6}-`);
        await issue(`${YEAR + 6}-99999999999`); // eleven digits: not a counter value
        await issue(`${YEAR + 6}-4294967296`); // does not fit the 32-bit counter
        await issue(`${YEAR + 6}00-000500`); // the year is not a four-digit run
        await issue(`${YEAR + 6}-000020`);

        expect(
          (await draw(DocumentType.INVOICE, inYear(YEAR + 6))).number,
        ).toBe(`${YEAR + 6}-000021`);
      });

      it("never raises a counter to the integer maximum, and refuses the draw past it with 409", async () => {
        await issue(`${YEAR}-2147483647`); // a hand-made number at the very top
        await issue(`${YEAR}-2147483645`);

        const raised = await asTenant(() =>
          db.app.transaction((manager) =>
            raiseCounterToIssued(manager, user.id, DocumentType.INVOICE),
          ),
        );
        expect(raised).toBe(2147483645);
        expect((await draw(DocumentType.INVOICE, inYear(YEAR))).number).toBe(
          `${YEAR}-2147483646`,
        );

        await db.admin.query(
          `UPDATE document_counters SET value = 2147483647
           WHERE user_id = $1 AND document_type = 'invoice'`,
          [user.id],
        );
        await expect(
          draw(DocumentType.INVOICE, inYear(YEAR)),
        ).rejects.toMatchObject({
          statusCode: 409,
          errorCode: "DOCUMENT_NUMBERS_EXHAUSTED",
        });
      });

      it("repairs only the colliding year's counter", async () => {
        await setFormat(DocumentType.INVOICE, { resetEveryYear: true });
        await draw(DocumentType.INVOICE, inYear(YEAR));
        await draw(DocumentType.INVOICE, inYear(YEAR + 1));
        await issue(`${YEAR + 1}-000040`);
        await issue(`${YEAR}-000900`);

        const raised = await asTenant(() =>
          db.app.transaction((manager) =>
            raiseCounterToIssued(
              manager,
              user.id,
              DocumentType.INVOICE,
              YEAR + 1,
            ),
          ),
        );

        expect(raised).toBe(40);
        expect(await yearRows(DocumentType.INVOICE)).toEqual([
          { year: YEAR, value: 1 },
          { year: YEAR + 1, value: 40 },
        ]);
      });

      it("starts every new year at the saved start number and judges a new start against this year", async () => {
        await setFormat(DocumentType.INVOICE, {
          resetEveryYear: true,
          startNumber: 100,
        });
        expect((await draw(DocumentType.INVOICE, inYear(YEAR))).number).toBe(
          `${YEAR}-000100`,
        );
        expect(
          (await draw(DocumentType.INVOICE, inYear(YEAR + 5))).number,
        ).toBe(`${YEAR + 5}-000100`);

        const refusal = await setFormat(DocumentType.INVOICE, {
          resetEveryYear: true,
          startNumber: 50,
        }).catch((error: unknown) => error);
        expect(refusal).toMatchObject({
          errorCode: "NUMBERING_START_TOO_LOW",
          details: { minStart: 101 },
        });
      });

      it("does not let a switched-off counter fall below what the reset already issued", async () => {
        await generate(DocumentType.INVOICE);
        await setFormat(DocumentType.INVOICE, { resetEveryYear: true });
        for (let index = 0; index < 4; index++)
          await draw(DocumentType.INVOICE, inYear(YEAR));

        const off = await setFormat(DocumentType.INVOICE, {
          resetEveryYear: false,
        });

        // The year counter stood at 5 (1 issued before the switch, 4 after).
        expect(off).toMatchObject({ resetEveryYear: false, nextValue: 6 });
        expect((await draw(DocumentType.INVOICE, inYear(YEAR))).number).toBe(
          `${YEAR}-000006`,
        );
      });

      it("keeps the saved switch when a save leaves it out, and refuses to drop the year under it", async () => {
        await setFormat(DocumentType.INVOICE, { resetEveryYear: true });
        const kept = await setFormat(DocumentType.INVOICE, { prefix: "КП" });
        expect(kept).toMatchObject({ resetEveryYear: true, prefix: "КП" });

        const refusal = await setFormat(DocumentType.INVOICE, {
          includeYear: false,
        }).catch((error: unknown) => error);
        expect(refusal).toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect((await draw(DocumentType.INVOICE, inYear(YEAR))).number).toBe(
          `КП-${YEAR}-000001`,
        );
      });

      it("refuses, at the database, a reset without the year in the number", async () => {
        await expect(
          db.admin.query(
            `INSERT INTO document_counters (user_id, document_type, reset_every_year, include_year)
             VALUES ($1, 'act', true, false)`,
            [user.id],
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          db.admin.query(
            `INSERT INTO document_counters (user_id, document_type, start_number) VALUES ($1, 'act', 0)`,
            [user.id],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("leaves users.receipt_counter alone for a waybill under the reset", async () => {
        await db.admin.query(
          `UPDATE users SET receipt_counter = 7 WHERE id = $1`,
          [user.id],
        );
        await setFormat(DocumentType.WAYBILL, { resetEveryYear: true });

        const first = await draw(DocumentType.WAYBILL, inYear(YEAR + 1));

        expect(first.number).toBe(`${YEAR + 1}-000001`);
        expect(
          (
            await db.admin.query(
              `SELECT receipt_counter FROM users WHERE id = $1`,
              [user.id],
            )
          )[0].receipt_counter,
        ).toBe(7);
      });

      it("keeps one account's yearly counters out of reach of another", async () => {
        await setFormat(DocumentType.INVOICE, { resetEveryYear: true });
        await draw(DocumentType.INVOICE, inYear(YEAR));
        const other = await db.admin.getRepository(User).save({
          email: `${randomUUID()}@numbering.invalid`,
          password: "fixture",
        });

        const theirs = await asTenant(
          () => services.numbering.list(other.id),
          other,
        );

        expect(
          theirs.types.find((t) => t.documentType === DocumentType.INVOICE),
        ).toMatchObject({ resetEveryYear: false, nextValue: 1 });
        const peeked = await asTenant(
          () =>
            db.app.query(`SELECT * FROM document_year_counters`) as Promise<
              unknown[]
            >,
          other,
        );
        expect(peeked).toEqual([]);
      });
    });

    it("refuses a prefix the database would not accept, even if validation were bypassed", async () => {
      for (const prefix of ["A1", "A/B", 'A"B', "A\\B", "A\tB"])
        await expect(
          db.admin.query(
            `INSERT INTO document_counters (user_id, document_type, prefix) VALUES ($1, 'act', $2)`,
            [user.id, prefix],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      await expect(
        db.admin.query(
          `INSERT INTO document_counters (user_id, document_type, padding) VALUES ($1, 'act', 10)`,
          [user.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await db.admin.query(
        `INSERT INTO document_counters (user_id, document_type, prefix) VALUES ($1, 'act', 'РФ-')`,
        [user.id],
      );
    });
  },
);
