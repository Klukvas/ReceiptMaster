import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { AddOrderItemReturnedQty1793300000000 } from "../src/config/migrations/1793300000000-AddOrderItemReturnedQty";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1793300000000-AddOrderItemReturnedQty.ts";
const NEW_MIGRATION = "AddOrderItemReturnedQty1793300000000";
const TYPE_INDEX = "IDX_receipts_order_document_type";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * A voided quotation frees its slot on the order, like a voided invoice or act. The
 * migration widens the reissuable types of the one-document-per-type index to include
 * quotes (any other voided type keeps its slot), and refuses to go back while a reissued
 * quotation sits next to its voided predecessor.
 */
describeIsolatedPostgres(
  "AddOrderItemReturnedQty migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_returned_qty_${suffix}`;
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

    const insertLine = async (qty: number): Promise<string> => {
      const orderId = await newOrder();
      const productId = randomUUID();
      const id = randomUUID();
      await current.query(
        `INSERT INTO products (id, name, purchase_price_cents, sale_price_cents, quantity, currency, user_id)
         VALUES ($1, $3, 100, 500, 10, 'UAH', $2)`,
        [productId, tenant, `P-${productId}`],
      );
      await current.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_cents, qty, line_total_cents, user_id)
         VALUES ($1, $2, $3, 'P', 500, $4, $5, $6)`,
        [id, orderId, productId, qty, qty * 500, tenant],
      );
      return id;
    };

    const column = async () => {
      const rows: Array<{ column_default: string; is_nullable: string }> =
        await current.query(
          `SELECT column_default, is_nullable FROM information_schema.columns
           WHERE table_name = 'order_items' AND column_name = 'returned_qty'`,
        );
      return rows[0];
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

    it("is the only pending migration and adds a non-null column defaulting to zero", async () => {
      const legacy = await insertLine(2);
      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await column()).toEqual({
        column_default: "0",
        is_nullable: "NO",
      });
      expect(
        (
          await current.query(
            `SELECT returned_qty FROM order_items WHERE id = $1`,
            [legacy],
          )
        )[0].returned_qty,
      ).toBe(0);
      expect(await current.showMigrations()).toBe(false);
    });

    it("keeps the quantity between zero and the line quantity", async () => {
      await migrateToLatest();
      const id = await insertLine(3);
      const set = (value: number) =>
        current.query(
          `UPDATE order_items SET returned_qty = $1 WHERE id = $2`,
          [value, id],
        );

      await set(3);
      await expect(set(4)).rejects.toMatchObject({
        code: "23514",
        constraint: "CHK_order_items_returned_qty_range",
      });
      await expect(set(-1)).rejects.toMatchObject({ code: "23514" });
    });

    it("reverts cleanly while nothing is returned, and is safe to run again", async () => {
      await migrateToLatest();
      await current.query(`UPDATE order_items SET returned_qty = 0`);
      await current.undoLastMigration({ transaction: "all" });
      expect(await column()).toBeUndefined();

      const reapplied = await migrateToLatest();
      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
    });

    it("refuses to revert while any line has returned goods, rather than forget them", async () => {
      await migrateToLatest();
      await current.query(`UPDATE order_items SET returned_qty = 0`);
      const id = await insertLine(2);
      await current.query(
        `UPDATE order_items SET returned_qty = 1 WHERE id = $1`,
        [id],
      );

      await expect(
        current.undoLastMigration({ transaction: "all" }),
      ).rejects.toThrow(/Cannot revert: order lines with returned goods/);
      expect(await column()).toBeDefined();
      await current.query(`UPDATE order_items SET returned_qty = 0`);
      await current.undoLastMigration({ transaction: "all" });
      expect(await column()).toBeUndefined();
      await migrateToLatest();
    });

    it("refuses to revert under a role that row security filters, rather than miss lines", async () => {
      await migrateToLatest();
      const role = `audit_returned_qty_app_${suffix}`;
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
          new AddOrderItemReturnedQty1793300000000().down(queryRunner),
        ).rejects.toThrow(/row security does not filter/);
      } finally {
        await app.end();
      }
    });
  },
);
