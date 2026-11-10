import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { ReissueVoidedQuotes1793200000000 } from "../src/config/migrations/1793200000000-ReissueVoidedQuotes";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1793200000000-ReissueVoidedQuotes.ts";
const NEW_MIGRATION = "ReissueVoidedQuotes1793200000000";
const TYPE_INDEX = "IDX_receipts_order_document_type";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * A voided quotation frees its slot on the order, like a voided invoice or act. The
 * migration widens the reissuable types of the one-document-per-type index to include
 * quotes (any other voided type keeps its slot), and refuses to go back while a reissued
 * quotation sits next to its voided predecessor.
 */
describeIsolatedPostgres(
  "ReissueVoidedQuotes migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_reissue_quotes_${suffix}`;
    const tenant = randomUUID();
    const recipientId = randomUUID();
    const roles: string[] = [];
    let root: Client;
    let current: DataSource;
    let sequence = 0;

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

    const newOrder = async (): Promise<string> => {
      const id = randomUUID();
      await current.query(
        `INSERT INTO orders (id, recipient_id, status, subtotal_cents, total_cents, currency, user_id)
         VALUES ($1, $2, 'confirmed', 1500, 1500, 'UAH', $3)`,
        [id, recipientId, tenant],
      );
      return id;
    };

    const insertReceipt = (orderId: string, type: string, status: string) =>
      current.query(
        `INSERT INTO receipts (id, order_id, number, user_id, document_type, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          orderId,
          `2026-${String(++sequence).padStart(6, "0")}`,
          tenant,
          type,
          status,
        ],
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
      await previous.query(
        `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
        [tenant, `${tenant}@migration.invalid`],
      );
      await previous.query(
        `INSERT INTO recipients (id, name, user_id) VALUES ($1, 'Legacy', $2)`,
        [recipientId, tenant],
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

    it("is the only pending migration and keeps the index name, now letting quotes be reissued", async () => {
      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await indexDefinition()).toContain(`'quote'`);
      expect(await current.showMigrations()).toBe(false);
    });

    it("is safe to run again after a revert", async () => {
      await migrateToLatest();
      await current.undoLastMigration({ transaction: "all" });
      expect(await indexDefinition()).not.toContain(`'quote'`);

      const reapplied = await migrateToLatest();

      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await indexDefinition()).toContain(`'quote'`);
    });

    it("allows a live quote next to voided ones but not two live ones", async () => {
      await migrateToLatest();
      const orderId = await newOrder();

      await insertReceipt(orderId, "quote", "void");
      await insertReceipt(orderId, "quote", "void");
      await insertReceipt(orderId, "quote", "generated");
      await expect(
        insertReceipt(orderId, "quote", "processing"),
      ).rejects.toMatchObject({ code: "23505", constraint: TYPE_INDEX });
    });

    it.each(["invoice", "act"])(
      "still lets a voided %s be reissued",
      async (type) => {
        await migrateToLatest();
        const orderId = await newOrder();

        await insertReceipt(orderId, type, "void");
        await insertReceipt(orderId, type, "generated");
      },
    );

    it.each(["waybill", "sales_receipt", "packing_list"])(
      "keeps the slot of a voided %s, so it can never be issued again",
      async (type) => {
        await migrateToLatest();
        const orderId = await newOrder();

        await insertReceipt(orderId, type, "void");

        await expect(
          insertReceipt(orderId, type, "generated"),
        ).rejects.toMatchObject({ code: "23505", constraint: TYPE_INDEX });
      },
    );

    it("refuses to revert under a role that row security filters, rather than miss duplicates", async () => {
      await migrateToLatest();
      const role = `audit_reissue_quotes_app_${suffix}`;
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
          new ReissueVoidedQuotes1793200000000().down(queryRunner),
        ).rejects.toThrow(/row security does not filter/);
      } finally {
        await app.end();
      }
    });

    it("refuses to revert while a reissued quote sits next to a voided one", async () => {
      await migrateToLatest();

      await expect(
        current.undoLastMigration({ transaction: "all" }),
      ).rejects.toThrow(/\(quote\)/);
      expect(await current.showMigrations()).toBe(false);
      expect(await indexDefinition()).toContain(`'quote'`);
    });

    it("reverts once no order holds two quotes, restoring the previous index and keeping invoice and act reissue", async () => {
      await migrateToLatest();
      await current.query(
        `DELETE FROM receipts WHERE document_type = 'quote' AND status = 'void'`,
      );

      await current.undoLastMigration({ transaction: "all" });

      expect(await indexDefinition()).not.toContain(`'quote'`);
      expect(await indexDefinition()).toContain(`'void'`);
      const quoteOrder = await newOrder();
      await insertReceipt(quoteOrder, "quote", "void");
      await expect(
        insertReceipt(quoteOrder, "quote", "generated"),
      ).rejects.toMatchObject({ code: "23505", constraint: TYPE_INDEX });
      const invoiceOrder = await newOrder();
      await insertReceipt(invoiceOrder, "invoice", "void");
      await insertReceipt(invoiceOrder, "invoice", "generated");
    });
  },
);
