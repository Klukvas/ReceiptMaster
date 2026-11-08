import "reflect-metadata";
import { randomUUID } from "crypto";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import {
  DocumentType,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { User } from "../src/modules/users/entities/user.entity";
import { buildDocumentServices } from "./helpers/document-services";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";
import type { RestrictedAppDatabase } from "./helpers/restricted-app-database";

type SeededDocument = {
  id: string;
  orderId: string;
  recipientId: string;
};

/** GET /receipts on PostgreSQL: the real query, row-level security and joins. */
describeIsolatedPostgres(
  "documents list on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let receipts: ReturnType<typeof buildDocumentServices>["receipts"];
    let owner: User;
    let stranger: User;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_doclist");
      receipts = buildDocumentServices(db.app).receipts;
      const users = db.admin.getRepository(User);
      owner = await users.save({
        email: `${randomUUID()}@list.invalid`,
        password: "fixture",
      });
      stranger = await users.save({
        email: `${randomUUID()}@list.invalid`,
        password: "fixture",
      });
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    const seed = async (
      user: User,
      options: {
        recipient: { name: string; legalName?: string };
        type?: DocumentType;
        status?: ReceiptStatus;
        number: string;
        createdAt: string;
        orderDeleted?: boolean;
        recipientId?: string;
      },
    ): Promise<SeededDocument> => {
      const recipientId =
        options.recipientId ??
        (
          await db.admin.query(
            `INSERT INTO recipients (id, name, legal_name, user_id) VALUES ($1, $2, $3, $4) RETURNING id`,
            [
              randomUUID(),
              options.recipient.name,
              options.recipient.legalName ?? null,
              user.id,
            ],
          )
        )[0].id;
      const [{ id: orderId }] = await db.admin.query(
        `INSERT INTO orders (id, recipient_id, status, subtotal_cents, total_cents, currency, user_id, deleted_at)
         VALUES ($1, $2, 'confirmed', 1000, 1000, 'UAH', $3, $4) RETURNING id`,
        [
          randomUUID(),
          recipientId,
          user.id,
          options.orderDeleted ? new Date() : null,
        ],
      );
      const [{ id }] = await db.admin.query(
        `INSERT INTO receipts (id, order_id, number, user_id, document_type, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          randomUUID(),
          orderId,
          options.number,
          user.id,
          options.type ?? DocumentType.INVOICE,
          options.status ?? ReceiptStatus.GENERATED,
          options.createdAt,
        ],
      );
      return { id, orderId, recipientId };
    };

    const list = (
      query: Parameters<(typeof receipts)["findAll"]>[1] = {},
      user: User = owner,
    ) => runWithTenant(user.id, () => receipts.findAll(user, query));
    const ids = async (query: Parameters<(typeof receipts)["findAll"]>[1]) =>
      (await list(query)).data.map((r) => r.id);

    // Fixture, oldest first. Numbers are unique per type, not across types.
    let acme: SeededDocument; // invoice, generated, 2026-03-01 00:00:00.000Z (range start)
    let beta: SeededDocument; // act, void, 2026-03-31 23:59:59.999Z (range end)
    let percent: SeededDocument; // waybill, failed, 2026-04-01 00:00:00Z (outside)
    let underscore: SeededDocument; // invoice, processing
    let legal: SeededDocument; // quote, generated, legal name only
    let hidden: SeededDocument; // document of a soft-deleted order
    let foreign: SeededDocument;

    beforeAll(async () => {
      acme = await seed(owner, {
        recipient: { name: "Acme Trading" },
        number: "2026-000001",
        createdAt: "2026-03-01T00:00:00.000Z",
      });
      beta = await seed(owner, {
        recipient: { name: "Beta Works" },
        type: DocumentType.ACT,
        status: ReceiptStatus.VOID,
        number: "2026-000001",
        createdAt: "2026-03-31T23:59:59.999Z",
      });
      percent = await seed(owner, {
        recipient: { name: "100% Cotton" },
        type: DocumentType.WAYBILL,
        status: ReceiptStatus.FAILED,
        number: "2026-000002",
        createdAt: "2026-04-01T00:00:00.000Z",
      });
      underscore = await seed(owner, {
        recipient: { name: "A_B Studio" },
        status: ReceiptStatus.PROCESSING,
        number: "РФ-2026-000003",
        createdAt: "2026-04-02T10:00:00.000Z",
      });
      legal = await seed(owner, {
        recipient: { name: "Ivan", legalName: "ТОВ Горизонт" },
        type: DocumentType.QUOTE,
        number: "2026-000004",
        createdAt: "2026-04-03T10:00:00.000Z",
      });
      hidden = await seed(owner, {
        recipient: { name: "Ghost" },
        number: "2026-000005",
        createdAt: "2026-04-04T10:00:00.000Z",
        orderDeleted: true,
      });
      foreign = await seed(stranger, {
        recipient: { name: "Acme Trading" },
        number: "2026-000001",
        createdAt: "2026-03-15T10:00:00.000Z",
      });
    }, 30000);

    it("lists newest first with the order and the recipient's name", async () => {
      const page = await list();

      expect(page.data.map((r) => r.id)).toEqual([
        legal.id,
        underscore.id,
        percent.id,
        beta.id,
        acme.id,
      ]);
      expect(page).toMatchObject({ total: 5, offset: 0, limit: 20 });
      const first = page.data.find((r) => r.id === acme.id)!;
      expect(first.order).toMatchObject({
        id: acme.orderId,
        status: "confirmed",
      });
      expect(first.order.recipient.name).toBe("Acme Trading");
      expect(typeof first.order.order_number).toBe("number");
    });

    it("hides documents of soft-deleted orders and never shows another account's", async () => {
      const all = await ids({});
      expect(all).not.toContain(hidden.id);
      expect(all).not.toContain(foreign.id);
      expect((await list({}, stranger)).data.map((r) => r.id)).toEqual([
        foreign.id,
      ]);
    });

    it("lets row-level security hide the account's rows from another tenant", async () => {
      const crossed = await runWithTenant(stranger.id, () =>
        receipts.findAll(owner, {}),
      );
      expect(crossed).toMatchObject({ data: [], total: 0 });
    });

    it("filters by type and by status", async () => {
      expect(await ids({ type: DocumentType.INVOICE })).toEqual([
        underscore.id,
        acme.id,
      ]);
      expect(await ids({ status: ReceiptStatus.VOID })).toEqual([beta.id]);
      expect(
        await ids({
          type: DocumentType.INVOICE,
          status: ReceiptStatus.GENERATED,
        }),
      ).toEqual([acme.id]);
    });

    it("includes both ends of a day range in the account's zone (Europe/Kyiv by default)", async () => {
      // `beta` was created 2026-03-31 23:59:59.999 UTC, which is already 1 April 02:59 in Kyiv
      // (summer time began on 29 March); `acme` at 2026-03-01 00:00 UTC is 02:00 on 1 March.
      expect(
        await ids({ startDate: "2026-03-01", endDate: "2026-03-31" }),
      ).toEqual([acme.id]);
      expect(await ids({ startDate: "2026-04-01" })).toEqual([
        legal.id,
        underscore.id,
        percent.id,
        beta.id,
      ]);
      expect(await ids({ endDate: "2026-03-01" })).toEqual([acme.id]);
    });

    it("searches the number, the name and the legal name", async () => {
      expect(await ids({ search: "2026-000002" })).toEqual([percent.id]);
      expect(await ids({ search: "рф-" })).toEqual([underscore.id]);
      expect(await ids({ search: "beta" })).toEqual([beta.id]);
      expect(await ids({ search: "горизонт" })).toEqual([legal.id]);
    });

    it("finds a document by its order number, with or without #", async () => {
      const [{ order_number: orderNumber }] = await db.admin.query(
        `SELECT order_number FROM orders WHERE id = $1`,
        [acme.orderId],
      );
      expect(await ids({ search: `#${orderNumber}` })).toContain(acme.id);
      expect(await ids({ search: String(orderNumber) })).toContain(acme.id);
    });

    it("treats % and _ in the search literally", async () => {
      expect(await ids({ search: "%" })).toEqual([percent.id]);
      expect(await ids({ search: "100%" })).toEqual([percent.id]);
      expect(await ids({ search: "_" })).toEqual([underscore.id]);
      expect(await ids({ search: "a_b" })).toEqual([underscore.id]);
      expect(await ids({ search: "\\" })).toEqual([]);
    });

    it("sorts numbers by their counter value, not as text", async () => {
      const sorter = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@list.invalid`,
        password: "fixture",
      });
      const numbers = ["РФ-9", "РФ-10", "РФ-100", "АБ-2", "2026-000011"];
      for (const [index, number] of numbers.entries())
        await seed(sorter, {
          recipient: { name: `Sorted ${index}` },
          number,
          createdAt: `2026-05-0${index + 1}T10:00:00.000Z`,
        });

      const ascending = await list(
        { sortBy: "number", sortOrder: "ASC" as never },
        sorter,
      );
      const descending = await list(
        { sortBy: "number", sortOrder: "DESC" as never },
        sorter,
      );

      expect(ascending.data.map((r) => r.number)).toEqual([
        "АБ-2",
        "РФ-9",
        "РФ-10",
        "2026-000011",
        "РФ-100",
      ]);
      expect(descending.data.map((r) => r.number)).toEqual(
        [...ascending.data.map((r) => r.number)].reverse(),
      );
    });

    it("sorts by an allowed key and breaks ties by id", async () => {
      const byNumber = await list({
        sortBy: "number",
        sortOrder: "ASC" as never,
      });
      const counterValue = (text: string) => Number(/\d+$/.exec(text)?.[0]);
      expect(byNumber.data.map((r) => counterValue(r.number))).toEqual(
        byNumber.data.map((r) => counterValue(r.number)).sort((a, b) => a - b),
      );
      const sameNumber = byNumber.data.filter(
        (r) => r.number === "2026-000001",
      );
      expect(sameNumber.map((r) => r.id)).toEqual(
        sameNumber.map((r) => r.id).sort(),
      );
      // `status` is an enum column, so it sorts by the enum's own order.
      const labels: string[] = (
        await db.admin.query(
          `SELECT unnest(enum_range(NULL::receipts_status_enum))::text AS label`,
        )
      ).map((row: { label: string }) => row.label);
      const byStatus = (
        await list({ sortBy: "status", sortOrder: "DESC" as never })
      ).data.map((r) => labels.indexOf(r.status));
      expect(byStatus).toEqual([...byStatus].sort((a, b) => b - a));
      // An unknown key falls back to newest first.
      expect((await list({ sortBy: "pdf_url" })).data[0].id).toBe(legal.id);
    });

    it("pages with a stable total", async () => {
      const first = await list({ limit: 2, offset: 0 });
      const second = await list({ limit: 2, offset: 2 });
      const third = await list({ limit: 2, offset: 4 });

      expect([first.total, second.total, third.total]).toEqual([5, 5, 5]);
      expect(
        [...first.data, ...second.data, ...third.data].map((r) => r.id),
      ).toEqual([legal.id, underscore.id, percent.id, beta.id, acme.id]);
    });

    it("shows the recipient's live name, not the one frozen at issue time", async () => {
      await db.admin.query(`UPDATE recipients SET name = $2 WHERE id = $1`, [
        acme.recipientId,
        "Acme Renamed",
      ]);
      const page = await list({ search: "Renamed" });
      expect(page.data.map((r) => r.id)).toEqual([acme.id]);
      expect(page.data[0].order.recipient.name).toBe("Acme Renamed");
    });

    describe("calendar days in the account's document time zone", () => {
      let zoned: User;
      let at: Record<string, SeededDocument>;

      // Kyiv is UTC+2 in winter and UTC+3 in summer: each pair brackets local midnight.
      const instants: Record<string, string> = {
        winterBefore: "2026-03-01T21:59:59.999Z", // 1 March 23:59:59.999 Kyiv
        winterAfter: "2026-03-01T22:00:00.000Z", // 2 March 00:00 Kyiv
        winterEarly: "2026-03-02T00:30:00.000Z", // 2 March 02:30 Kyiv
        summerBefore: "2026-07-01T20:59:59.999Z", // 1 July 23:59:59.999 Kyiv
        summerAfter: "2026-07-01T21:00:00.000Z", // 2 July 00:00 Kyiv
        endOfMarch2: "2026-03-02T21:59:59.999Z", // 2 March 23:59:59.999 Kyiv
      };

      beforeAll(async () => {
        zoned = await db.admin.getRepository(User).save({
          email: `${randomUUID()}@zone.invalid`,
          password: "fixture",
        });
        at = {};
        let n = 0;
        for (const [name, createdAt] of Object.entries(instants))
          at[name] = await seed(zoned, {
            recipient: { name: `Zone ${name}` },
            number: `2026-${String(++n).padStart(6, "0")}`,
            createdAt,
          });
      }, 30000);

      const days = async (query: Parameters<(typeof receipts)["findAll"]>[1]) =>
        (await list(query, zoned)).data.map((r) => r.id).sort();
      const idsOf = (...names: string[]) => names.map((n) => at[n].id).sort();

      it("puts 00:00 to 03:00 local time on its own day, not the previous UTC day", async () => {
        expect(
          await days({ startDate: "2026-03-02", endDate: "2026-03-02" }),
        ).toEqual(idsOf("winterAfter", "winterEarly", "endOfMarch2"));
        expect(
          await days({ startDate: "2026-03-01", endDate: "2026-03-01" }),
        ).toEqual(idsOf("winterBefore"));
      });

      it("follows daylight saving time", async () => {
        expect(
          await days({ startDate: "2026-07-02", endDate: "2026-07-02" }),
        ).toEqual(idsOf("summerAfter"));
        expect(
          await days({ startDate: "2026-07-01", endDate: "2026-07-01" }),
        ).toEqual(idsOf("summerBefore"));
      });

      it("includes the last millisecond of the end day and nothing after it", async () => {
        expect(await days({ endDate: "2026-03-02" })).toEqual(
          idsOf("winterBefore", "winterAfter", "winterEarly", "endOfMarch2"),
        );
      });

      it("uses the zone saved in the account's configuration", async () => {
        await db.admin.query(
          `INSERT INTO user_settings ("userId", document_config) VALUES ($1, $2::jsonb)
           ON CONFLICT ("userId") DO UPDATE SET document_config = EXCLUDED.document_config`,
          [zoned.id, JSON.stringify({ formatting: { timeZone: "UTC" } })],
        );

        expect(
          await days({ startDate: "2026-03-01", endDate: "2026-03-01" }),
        ).toEqual(idsOf("winterBefore", "winterAfter"));
      });
    });
  },
);
