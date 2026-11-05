import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { ReissueVoidedDocuments1793100000000 } from "../src/config/migrations/1793100000000-ReissueVoidedDocuments";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1793100000000-ReissueVoidedDocuments.ts";
const NEW_MIGRATION = "ReissueVoidedDocuments1793100000000";
const TYPE_INDEX = "IDX_receipts_order_document_type";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * A voided invoice or act frees its slot on the order. The migration swaps the
 * one-document-per-type index for one that ignores voided invoices and acts (any other
 * voided type keeps its slot), and refuses to go back while a reissued document sits next
 * to its voided predecessor.
 */
describeIsolatedPostgres(
  "ReissueVoidedDocuments migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_reissue_migration_${suffix}`;
    const tenant = randomUUID();
    const orderId = randomUUID();
    const roles: string[] = [];
    let root: Client;
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

    const insertReceipt = (
      type: string,
      number: string,
      status = "generated",
    ) =>
      current.query(
        `INSERT INTO receipts (id, order_id, number, user_id, document_type, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), orderId, number, tenant, type, status],
      );

    const indexDefinition = async (): Promise<string> => {
      const rows: Array<{ indexdef: string }> = await current.query(
        `SELECT indexdef FROM pg_indexes WHERE indexname = $1`,
        [TYPE_INDEX],
      );
      return rows[0]?.indexdef ?? "";
    };

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);

      const previous = await ownerSource(
        migrationFiles.filter((file) => file !== NEW_MIGRATION_FILE),
      );
      await previous.runMigrations({ transaction: "all" });
      const recipientId = randomUUID();
      await previous.query(
        `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
        [tenant, `${tenant}@migration.invalid`],
      );
      await previous.query(
        `INSERT INTO recipients (id, name, user_id) VALUES ($1, 'Legacy', $2)`,
        [recipientId, tenant],
      );
      await previous.query(
        `INSERT INTO orders (id, recipient_id, status, subtotal_cents, total_cents, currency, user_id)
         VALUES ($1, $2, 'confirmed', 1500, 1500, 'UAH', $3)`,
        [orderId, recipientId, tenant],
      );
      await previous.destroy();

      current = await ownerSource(migrationFiles);
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [current],
        admin: root,
        databases: [database],
        roles,
      }),
    );

    it("is the only pending migration and keeps the index name, now ignoring void rows", async () => {
      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await indexDefinition()).toContain(`'void'`);
      expect(await current.showMigrations()).toBe(false);
    });

    it("is safe to run again after a revert", async () => {
      await migrateToLatest();
      await current.undoLastMigration({ transaction: "all" });
      expect(await indexDefinition()).not.toContain(`'void'`);

      const reapplied = await migrateToLatest();

      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await indexDefinition()).toContain(`'void'`);
    });

    it("allows a live document next to voided ones but not two live ones", async () => {
      await migrateToLatest();

      await insertReceipt("invoice", "2026-000001", "void");
      await insertReceipt("invoice", "2026-000002", "void");
      await insertReceipt("invoice", "2026-000003", "generated");
      await expect(
        insertReceipt("invoice", "2026-000004", "processing"),
      ).rejects.toMatchObject({ code: "23505", constraint: TYPE_INDEX });
      await insertReceipt("act", "2026-000001", "generated");
    });

    it.each(["waybill", "sales_receipt", "packing_list"])(
      "keeps the slot of a voided %s, so it can never be issued again",
      async (type) => {
        await migrateToLatest();
        const otherOrder = randomUUID();
        await current.query(
          `INSERT INTO orders (id, recipient_id, status, subtotal_cents, total_cents, currency, user_id)
           SELECT $1, recipient_id, 'confirmed', 1500, 1500, 'UAH', user_id FROM orders WHERE id = $2`,
          [otherOrder, orderId],
        );
        const insert = (status: string, number: string) =>
          current.query(
            `INSERT INTO receipts (id, order_id, number, user_id, document_type, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [randomUUID(), otherOrder, number, tenant, type, status],
          );

        await insert("void", "2026-000700");

        await expect(insert("generated", "2026-000701")).rejects.toMatchObject({
          code: "23505",
          constraint: TYPE_INDEX,
        });
      },
    );

    it("refuses to revert under a role that row security filters, rather than miss duplicates", async () => {
      await migrateToLatest();
      const role = `audit_reissue_app_${suffix}`;
      roles.push(role);
      const password = await createRestrictedRole(root, role);
      const app = new Client({
        host: connection.host,
        port: connection.port,
        user: role,
        password,
        database,
      });
      await app.connect();
      try {
        const queryRunner = {
          query: async (sql: string, params?: unknown[]) =>
            (await app.query(sql, params)).rows,
        } as never;

        await expect(
          new ReissueVoidedDocuments1793100000000().down(queryRunner),
        ).rejects.toThrow(/row security does not filter/);
      } finally {
        await app.end();
      }
    });

    it("refuses to revert while a reissued document sits next to a voided one", async () => {
      await migrateToLatest();

      await expect(
        current.undoLastMigration({ transaction: "all" }),
      ).rejects.toThrow(new RegExp(`${orderId} \\(invoice\\)`));
      expect(await current.showMigrations()).toBe(false);
      expect(
        await current.query(
          `SELECT count(*)::int AS n FROM receipts WHERE status = 'void' AND document_type = 'invoice'`,
        ),
      ).toEqual([{ n: 2 }]);
    });

    it("reverts once no order holds two rows of a type, restoring the strict index", async () => {
      await migrateToLatest();
      await current.query(
        `DELETE FROM receipts WHERE document_type = 'invoice' AND status = 'void'`,
      );

      await current.undoLastMigration({ transaction: "all" });

      expect(await indexDefinition()).not.toContain(`'void'`);
      await expect(
        insertReceipt("act", "2026-000009", "void"),
      ).rejects.toMatchObject({ code: "23505", constraint: TYPE_INDEX });
    });
  },
);
