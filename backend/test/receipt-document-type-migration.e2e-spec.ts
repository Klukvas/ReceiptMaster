import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1792800000000-AddReceiptDocumentType.ts";
const NEW_MIGRATION = "AddReceiptDocumentType1792800000000";
const TYPE_INDEX = "IDX_receipts_order_document_type";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * A receipt becomes one of several document types: an order may carry one document per
 * type, and any number of return notes. The migration runs on a database built by the
 * previous release (one receipt per order, unique `order_id`), then reverts and re-applies.
 */
describeIsolatedPostgres(
  "receipts.document_type migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_doctype_migration_${suffix}`;
    const tenant = randomUUID();
    const orderId = randomUUID();
    const legacyReceiptId = randomUUID();
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

    const insertReceipt = (type: string, number: string, order = orderId) =>
      current.query(
        `INSERT INTO receipts (id, order_id, number, user_id, document_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), order, number, tenant, type],
      );

    const orderUniqueIndexes = () =>
      current.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'receipts' AND indexdef LIKE 'CREATE UNIQUE%(order_id%'
         ORDER BY indexname`,
      );

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);

      previous = await ownerSource(
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
      await previous.query(
        `INSERT INTO receipts (id, order_id, number, user_id) VALUES ($1, $2, '2026-000001', $3)`,
        [legacyReceiptId, orderId, tenant],
      );

      current = await ownerSource(migrationFiles);
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [current, previous],
        admin: root,
        databases: [database],
        roles: [],
      }),
    );

    it("is the only pending migration and turns every existing receipt into a waybill", async () => {
      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(
        await current.query(
          "SELECT document_type FROM receipts WHERE id = $1",
          [legacyReceiptId],
        ),
      ).toEqual([{ document_type: "waybill" }]);
      expect(await current.showMigrations()).toBe(false);
    });

    it("replaces the unique order_id with uniqueness per order and type", async () => {
      await migrateToLatest();

      expect(await orderUniqueIndexes()).toEqual([{ indexname: TYPE_INDEX }]);
    });

    it("allows one document of each other type on an order but not two of the same", async () => {
      await migrateToLatest();

      await expect(
        insertReceipt("waybill", "2026-000002"),
      ).rejects.toMatchObject({ code: "23505", constraint: TYPE_INDEX });
      await insertReceipt("invoice", "2026-000003");
      await expect(
        insertReceipt("invoice", "2026-000004"),
      ).rejects.toMatchObject({ code: "23505", constraint: TYPE_INDEX });
    });

    it("allows several return notes on one order", async () => {
      await migrateToLatest();

      await insertReceipt("return_note", "2026-000005");
      await insertReceipt("return_note", "2026-000006");

      expect(
        await current.query(
          "SELECT count(*)::int AS n FROM receipts WHERE order_id = $1 AND document_type = 'return_note'",
          [orderId],
        ),
      ).toEqual([{ n: 2 }]);
    });

    it("refuses to revert while documents of another type exist", async () => {
      await migrateToLatest();

      await expect(
        current.undoLastMigration({ transaction: "all" }),
      ).rejects.toThrow(/other than waybill/);
      expect(await current.showMigrations()).toBe(false);
    });

    it("reverts to unique order_id once only waybills remain, and re-applies", async () => {
      await migrateToLatest();
      await current.query(
        "DELETE FROM receipts WHERE document_type <> 'waybill'",
      );

      await current.undoLastMigration({ transaction: "all" });

      expect(
        await current.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_name = 'receipts' AND column_name = 'document_type'`,
        ),
      ).toEqual([]);
      expect(await orderUniqueIndexes()).toHaveLength(1);
      await expect(
        current.query(
          `INSERT INTO receipts (id, order_id, number, user_id) VALUES ($1, $2, '2026-000099', $3)`,
          [randomUUID(), orderId, tenant],
        ),
      ).rejects.toMatchObject({ code: "23505" });

      const reapplied = await migrateToLatest();

      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await orderUniqueIndexes()).toEqual([{ indexname: TYPE_INDEX }]);
    });
  },
);
