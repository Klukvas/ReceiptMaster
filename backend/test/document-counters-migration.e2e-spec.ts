import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { applyRuntimeGrants } from "./helpers/db-roles";
import { DocumentType } from "../src/modules/receipts/entities/receipt.entity";
import { nextDocumentNumber } from "../src/modules/receipts/receipt-number";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1792900000000-DocumentCounters.ts";
const NEW_MIGRATION = "DocumentCounters1792900000000";
const NEW_INDEX = "IDX_receipts_user_type_number";
const OLD_INDEX = "IDX_receipts_user_number";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * Each document type counts on its own per account. The migration runs on a database
 * built by the previous release (one counter on the user row), then reverts and
 * re-applies.
 */
describeIsolatedPostgres(
  "document_counters migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_doc_counters_${suffix}`;
    const veteran = randomUUID(); // old counter 5, highest number 7, plus an invoice
    const newcomer = randomUUID(); // never generated anything
    const evicted = randomUUID(); // counter 3 but every receipt was evicted
    const roles: string[] = [];
    let root: Client;
    let previous: DataSource;
    let current: DataSource;

    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".ts") && file <= NEW_MIGRATION_FILE)
      .sort();

    const ownerSource = (files: string[]) =>
      new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database,
        entities: ENTITIES,
        migrations: files.map((file) => join(MIGRATIONS_DIR, file)),
        synchronize: false,
      }).initialize();

    const migrateToLatest = () => current.runMigrations({ transaction: "all" });

    const seedAccount = async (userId: string, receiptCounter: number) => {
      await previous.query(
        `INSERT INTO users (id, email, password, receipt_counter) VALUES ($1, $2, 'fixture', $3)`,
        [userId, `${userId}@migration.invalid`, receiptCounter],
      );
    };

    const seedOrder = async (source: DataSource, userId: string) => {
      const recipientId = randomUUID();
      const orderId = randomUUID();
      await source.query(
        `INSERT INTO recipients (id, name, user_id) VALUES ($1, 'Fixture', $2)`,
        [recipientId, userId],
      );
      await source.query(
        `INSERT INTO orders (id, recipient_id, status, subtotal_cents, total_cents, currency, user_id)
         VALUES ($1, $2, 'confirmed', 1500, 1500, 'UAH', $3)`,
        [orderId, recipientId, userId],
      );
      return orderId;
    };

    const seedReceipt = (
      userId: string,
      orderId: string,
      type: string,
      number: string,
    ) =>
      previous.query(
        `INSERT INTO receipts (id, order_id, number, user_id, document_type) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), orderId, number, userId, type],
      );

    const asTenant = <T>(
      userId: string,
      work: (m: DataSource["manager"]) => Promise<T>,
    ) =>
      current.transaction(async (manager) => {
        await manager.query(
          `SELECT set_config('app.current_user_id', $1, true)`,
          [userId],
        );
        return work(manager);
      });

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);

      previous = await ownerSource(
        migrationFiles.filter((file) => file !== NEW_MIGRATION_FILE),
      );
      await previous.runMigrations({ transaction: "all" });

      await seedAccount(veteran, 5);
      await seedAccount(newcomer, 0);
      await seedAccount(evicted, 3);
      const order = await seedOrder(previous, veteran);
      await seedReceipt(veteran, order, "waybill", "2026-000007");
      await seedReceipt(veteran, order, "invoice", "2026-000002");
      await seedReceipt(veteran, order, "act", "HAND-EDITED");

      current = await ownerSource(migrationFiles);
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [current, previous],
        admin: root,
        databases: [database],
        roles,
      }),
    );

    it("is the only pending migration", async () => {
      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await current.showMigrations()).toBe(false);
    });

    it("starts each counter at the highest number the account already holds", async () => {
      await migrateToLatest();

      const read = (userId: string) =>
        current.query(
          `SELECT document_type::text AS document_type, value FROM document_counters
           WHERE user_id = $1 ORDER BY document_type::text`,
          [userId],
        );
      expect(await read(veteran)).toEqual([
        { document_type: "invoice", value: 2 },
        { document_type: "waybill", value: 7 },
      ]);
      expect(await read(newcomer)).toEqual([]);
      expect(await read(evicted)).toEqual([
        { document_type: "waybill", value: 3 },
      ]);
    });

    it("counts waybills from the legacy counter when an older image ran in between", async () => {
      const rolledBack = randomUUID();
      await seedAccount(rolledBack, 4);
      await asTenant(rolledBack, (m) =>
        nextDocumentNumber(m, rolledBack, DocumentType.WAYBILL),
      );
      // The older image only ever writes users.receipt_counter.
      await current.query(
        `UPDATE users SET receipt_counter = 20 WHERE id = $1`,
        [rolledBack],
      );

      const next = await asTenant(rolledBack, (m) =>
        nextDocumentNumber(m, rolledBack, DocumentType.WAYBILL),
      );

      expect(next).toBe(`${new Date().getUTCFullYear()}-000021`);
    });

    it("keeps row-level security forced on the counters", async () => {
      await migrateToLatest();

      expect(
        await current.query(
          `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'document_counters'`,
        ),
      ).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    });

    it("continues each type above its history and starts new types at one", async () => {
      await migrateToLatest();

      const waybill = await asTenant(veteran, (m) =>
        nextDocumentNumber(m, veteran, DocumentType.WAYBILL),
      );
      const act = await asTenant(veteran, (m) =>
        nextDocumentNumber(m, veteran, DocumentType.ACT),
      );
      const first = await asTenant(newcomer, (m) =>
        nextDocumentNumber(m, newcomer, DocumentType.WAYBILL),
      );

      const year = new Date().getUTCFullYear();
      expect(waybill).toBe(`${year}-000008`);
      expect(act).toBe(`${year}-000001`);
      expect(first).toBe(`${year}-000001`);
      // The legacy counter stays in step for waybills.
      expect(
        await current.query(`SELECT receipt_counter FROM users WHERE id = $1`, [
          veteran,
        ]),
      ).toEqual([{ receipt_counter: 8 }]);
    });

    it("never hands out the same number twice under concurrent generation", async () => {
      await migrateToLatest();

      const numbers = await Promise.all(
        Array.from({ length: 20 }, () =>
          asTenant(evicted, (m) =>
            nextDocumentNumber(m, evicted, DocumentType.INVOICE),
          ),
        ),
      );

      expect(new Set(numbers).size).toBe(20);
    });

    it("allows the same number in different types but not twice in one", async () => {
      await migrateToLatest();
      const firstOrder = await seedOrder(current, evicted);
      const secondOrder = await seedOrder(current, evicted);
      const insert = (type: string, orderId: string) =>
        current.query(
          `INSERT INTO receipts (id, order_id, number, user_id, document_type)
           VALUES ($1, $2, '2026-000500', $3, $4)`,
          [randomUUID(), orderId, evicted, type],
        );

      await insert("waybill", firstOrder);
      await insert("invoice", firstOrder);
      await expect(insert("waybill", secondOrder)).rejects.toMatchObject({
        code: "23505",
        constraint: NEW_INDEX,
      });
    });

    it("bumps counters under row security as a restricted role, and only for its own tenant", async () => {
      await migrateToLatest();
      const role = `audit_doc_counters_app_${suffix}`;
      roles.push(role);
      const password = await createRestrictedRole(root, role);
      await applyRuntimeGrants(current, connection.user, role);
      const app = new Client({
        host: connection.host,
        port: connection.port,
        user: role,
        password,
        database,
      });
      await app.connect();
      try {
        const bump = (tenant: string | null, userId: string) =>
          app.query("BEGIN").then(async () => {
            try {
              if (tenant !== null)
                await app.query(
                  `SELECT set_config('app.current_user_id', $1, true)`,
                  [tenant],
                );
              return await nextDocumentNumber(
                {
                  query: async (sql: string, params: unknown[]) =>
                    (await app.query(sql, params)).rows,
                } as never,
                userId,
                DocumentType.WAYBILL,
              );
            } finally {
              await app.query("ROLLBACK");
            }
          });

        const year = new Date().getUTCFullYear();
        const before = await current.query(
          `SELECT value FROM document_counters WHERE user_id = $1 AND document_type = 'waybill'`,
          [veteran],
        );
        // Own tenant: the upsert passes WITH CHECK and the users update is permitted.
        expect(await bump(veteran, veteran)).toBe(
          `${year}-${String(before[0].value + 1).padStart(6, "0")}`,
        );
        // No tenant context: the insert/update is rejected.
        await expect(bump(null, veteran)).rejects.toThrow(/row-level security/);
        // Another tenant cannot touch (or conflict into) this account's row.
        await expect(bump(newcomer, veteran)).rejects.toThrow(
          /row-level security/,
        );
        expect(
          await current.query(
            `SELECT value FROM document_counters WHERE user_id = $1 AND document_type = 'waybill'`,
            [veteran],
          ),
        ).toEqual(before);
      } finally {
        await app.end();
      }
    });

    it("refuses to revert while documents of another type exist", async () => {
      await migrateToLatest();

      await expect(
        current.undoLastMigration({ transaction: "all" }),
      ).rejects.toThrow(/other than waybill/);
      expect(await current.showMigrations()).toBe(false);
    });

    it("reverts once only waybills remain, restoring the old counter and index, and re-applies", async () => {
      await migrateToLatest();
      await current.query(
        "DELETE FROM receipts WHERE document_type <> 'waybill'",
      );

      await current.undoLastMigration({ transaction: "all" });

      expect(
        await current.query(
          `SELECT to_regclass('document_counters') AS present`,
        ),
      ).toEqual([{ present: null }]);
      expect(
        await current.query(
          `SELECT indexname FROM pg_indexes WHERE tablename = 'receipts' AND indexname IN ($1, $2)`,
          [OLD_INDEX, NEW_INDEX],
        ),
      ).toEqual([{ indexname: OLD_INDEX }]);
      // The counter never goes backwards: the veteran issued number 8 before the revert.
      expect(
        await current.query(`SELECT receipt_counter FROM users WHERE id = $1`, [
          veteran,
        ]),
      ).toEqual([{ receipt_counter: 8 }]);

      const reapplied = await migrateToLatest();

      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
    });
  },
);
