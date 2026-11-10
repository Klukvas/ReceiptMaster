import "reflect-metadata";
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
import { UpdateNumberingDto } from "../src/modules/receipts/dto/update-numbering.dto";
import {
  DocumentType,
  Receipt,
} from "../src/modules/receipts/entities/receipt.entity";
import {
  nextDocumentNumber,
  raiseCounterToIssued,
  releaseDocumentNumber,
} from "../src/modules/receipts/receipt-number";
import { buildDocumentServices } from "./helpers/document-services";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";
import type { RestrictedAppDatabase } from "./helpers/restricted-app-database";

const YEAR = new Date().getUTCFullYear();
const KEEP = { logoAction: "keep" } as const;
const BIG_START = 2_000_000_000;

/**
 * A counter that fell behind the numbers actually issued (restored backup, hand edit) heals
 * itself on the next issue, and a drawn number is handed back by value. Both read the result
 * of an UPDATE ... RETURNING, whose shape the postgres driver changes (`[rows, count]`), so
 * only a real server proves them.
 */
describeIsolatedPostgres(
  "document counter repair on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let services: ReturnType<typeof buildDocumentServices>;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "befix_counter");
      services = buildDocumentServices(db.app);
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@counter.invalid`,
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

    const counter = async (type: DocumentType): Promise<number> =>
      (
        await db.admin.query(
          `SELECT value FROM document_counters WHERE user_id = $1 AND document_type = $2`,
          [user.id, type],
        )
      )[0].value;

    const legacyCounter = async (): Promise<number> =>
      (
        await db.admin.query(
          `SELECT receipt_counter FROM users WHERE id = $1`,
          [user.id],
        )
      )[0].receipt_counter;

    const rewindCounter = (type: DocumentType, value: number) =>
      db.admin.query(
        `UPDATE document_counters SET value = $3 WHERE user_id = $1 AND document_type = $2`,
        [user.id, type, value],
      );

    describe.each([DocumentType.INVOICE, DocumentType.WAYBILL])(
      "a %s counter behind the issued numbers",
      (type) => {
        it("is raised by the issue itself, which then succeeds with the next free number", async () => {
          await generate(type);
          await generate(type);
          await rewindCounter(type, 0);
          if (type === DocumentType.WAYBILL)
            await db.admin.query(
              `UPDATE users SET receipt_counter = 0 WHERE id = $1`,
              [user.id],
            );

          const issued = await generate(type);

          expect(issued.number).toBe(`${YEAR}-000003`);
          expect(await counter(type)).toBe(3);
          if (type === DocumentType.WAYBILL)
            expect(await legacyCounter()).toBe(3);
        });
      },
    );

    it("reads the whole 10-digit counter value of a number started at the maximum", async () => {
      await asTenant(() =>
        services.numbering.update(
          user.id,
          DocumentType.INVOICE,
          Object.assign(new UpdateNumberingDto(), {
            prefix: "",
            padding: 6,
            includeYear: true,
            startNumber: BIG_START,
          }),
        ),
      );
      const first = await generate(DocumentType.INVOICE);
      expect(first.number).toBe(`${YEAR}-${BIG_START}`);
      await rewindCounter(DocumentType.INVOICE, 5);

      const raised = await asTenant(() =>
        db.app.transaction((manager) =>
          raiseCounterToIssued(manager, user.id, DocumentType.INVOICE),
        ),
      );

      expect(raised).toBe(BIG_START);
      expect(await counter(DocumentType.INVOICE)).toBe(BIG_START);
      expect((await generate(DocumentType.INVOICE)).number).toBe(
        `${YEAR}-${BIG_START + 1}`,
      );
    });

    it("never lowers a counter that is already ahead", async () => {
      await generate(DocumentType.ACT);
      await rewindCounter(DocumentType.ACT, 40);

      const raised = await asTenant(() =>
        db.app.transaction((manager) =>
          raiseCounterToIssued(manager, user.id, DocumentType.ACT),
        ),
      );

      expect(raised).toBe(40);
      expect(await counter(DocumentType.ACT)).toBe(40);
    });

    describe.each([DocumentType.INVOICE, DocumentType.WAYBILL])(
      "releasing a drawn %s number",
      (type) => {
        const draw = () =>
          asTenant(() =>
            db.app.transaction((manager) =>
              nextDocumentNumber(manager, user.id, type, { timeZone: "UTC" }),
            ),
          );
        const release = (value: number) =>
          asTenant(() =>
            db.app.transaction((manager) =>
              releaseDocumentNumber(manager, user.id, type, value),
            ),
          );

        it("steps the counter back and says so while the counter still stands at the value", async () => {
          const drawn = await draw();
          expect(await counter(type)).toBe(drawn.value);

          expect(await release(drawn.value)).toBe(true);

          expect(await counter(type)).toBe(drawn.value - 1);
          if (type === DocumentType.WAYBILL)
            expect(await legacyCounter()).toBe(drawn.value - 1);
        });

        it("leaves the gap and says false once a later number was handed out", async () => {
          const first = await draw();
          const second = await draw();

          expect(await release(first.value)).toBe(false);

          expect(await counter(type)).toBe(second.value);
        });
      },
    );
  },
);
