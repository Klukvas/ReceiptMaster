import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { installTenantContext } from "../src/common/tenancy/tenant-data-source";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { OrderItem } from "../src/modules/orders/entities/order-item.entity";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1792300000000-AddOrderItemUnitCost.ts";
const NEW_MIGRATION = "AddOrderItemUnitCost1792300000000";
const CHECK_NAME = "CHK_order_items_unit_cost_non_negative";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * The release path for the cost snapshot column on a fresh database: the chain
 * up to the previous release, legacy lines written without the column, then the
 * new migration, its revert, and a re-apply. Owner connections run migrations;
 * a NOSUPERUSER NOBYPASSRLS role granted before the column existed writes it
 * through the production tenant context afterwards.
 */
describeIsolatedPostgres(
  "order_items.unit_cost_cents migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_cost_migration_${suffix}`;
    const role = `audit_cost_migration_app_${suffix}`;
    const tenant = randomUUID();
    const otherTenant = randomUUID();
    const legacyLineIds = [randomUUID(), randomUUID()];
    let orderId: string;
    let productId: string;
    let root: Client;
    let previous: DataSource;
    let current: DataSource;
    let app: DataSource;
    let policiesBefore: unknown[];

    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((file) =>
      file.endsWith(".ts"),
    );

    const ownerSource = (files: string[]) =>
      new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database,
        // Entity metadata makes TypeORM install uuid-ossp, which the first
        // migration needs; synchronize stays off, so it never shapes the schema.
        entities: ENTITIES,
        migrations: files.map((file) => join(MIGRATIONS_DIR, file)),
        synchronize: false,
      }).initialize();

    const columnInfo = () =>
      current.query(
        `SELECT data_type, is_nullable FROM information_schema.columns
         WHERE table_name = 'order_items' AND column_name = 'unit_cost_cents'`,
      );

    const costConstraint = () =>
      current.query(
        `SELECT conname, convalidated FROM pg_constraint
         WHERE conrelid = 'order_items'::regclass AND conname = $1`,
        [CHECK_NAME],
      );

    const legacyCosts = async () =>
      (
        await current.query(
          "SELECT unit_cost_cents FROM order_items WHERE id = ANY($1::uuid[]) ORDER BY id",
          [legacyLineIds],
        )
      ).map((row: { unit_cost_cents: number | null }) => row.unit_cost_cents);

    const orderItemPolicies = () =>
      current.query(
        `SELECT policyname, cmd, qual, with_check FROM pg_policies
         WHERE tablename = 'order_items' ORDER BY policyname`,
      );

    const migrateToLatest = () => current.runMigrations({ transaction: "all" });

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      const rolePassword = await createRestrictedRole(root, role);

      // The schema as the previous release left it.
      previous = await ownerSource(
        migrationFiles.filter((file) => file !== NEW_MIGRATION_FILE),
      );
      await previous.runMigrations({ transaction: "all" });

      // Table-level grants made before the column exists (as on a live server).
      await previous.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await previous.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );

      // Legacy rows written by the previous release, without any cost snapshot.
      productId = randomUUID();
      orderId = randomUUID();
      const recipientId = randomUUID();
      for (const id of [tenant, otherTenant])
        await previous.query(
          `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
          [id, `${id}@migration.invalid`],
        );
      await previous.query(
        `INSERT INTO recipients (id, name, user_id) VALUES ($1, 'Legacy', $2)`,
        [recipientId, tenant],
      );
      await previous.query(
        `INSERT INTO products (id, name, purchase_price_cents, sale_price_cents, quantity, currency, user_id)
         VALUES ($1, 'Legacy beans', 100, 500, 10, 'UAH', $2)`,
        [productId, tenant],
      );
      await previous.query(
        `INSERT INTO orders (id, recipient_id, status, subtotal_cents, total_cents, currency, user_id)
         VALUES ($1, $2, 'confirmed', 1500, 1500, 'UAH', $3)`,
        [orderId, recipientId, tenant],
      );
      for (const [index, id] of legacyLineIds.entries())
        await previous.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_cents, qty, line_total_cents, user_id)
           VALUES ($1, $2, $3, 'Legacy beans', 500, $4, $5, $6)`,
          [id, orderId, productId, index + 1, 500 * (index + 1), tenant],
        );

      current = await ownerSource(migrationFiles);
      policiesBefore = await orderItemPolicies();
      app = installTenantContext(
        await new DataSource({
          type: "postgres",
          host: connection.host,
          port: connection.port,
          username: role,
          password: rolePassword,
          database,
          entities: ENTITIES,
          extra: { max: 2 },
        }).initialize(),
      );
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [app, current, previous],
        admin: root,
        databases: [database],
        roles: [role],
      }),
    );

    it("is the only pending migration and adds a nullable column that leaves legacy lines unknown", async () => {
      expect(await columnInfo()).toEqual([]);

      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await columnInfo()).toEqual([
        { data_type: "integer", is_nullable: "YES" },
      ]);
      expect(await costConstraint()).toEqual([
        { conname: CHECK_NAME, convalidated: true },
      ]);
      // No backfill from the product's current cost.
      expect(await legacyCosts()).toEqual([null, null]);
      // Tenant RLS on order_items is row-based and unchanged by the column.
      expect(await orderItemPolicies()).toEqual(policiesBefore);
      expect(await current.showMigrations()).toBe(false);
    });

    it("rejects a negative cost and accepts zero and NULL", async () => {
      await migrateToLatest();

      await expect(
        current.query(
          "UPDATE order_items SET unit_cost_cents = -1 WHERE id = $1",
          [legacyLineIds[0]],
        ),
      ).rejects.toMatchObject({ code: "23514", constraint: CHECK_NAME });
      await current.query(
        "UPDATE order_items SET unit_cost_cents = 0 WHERE id = $1",
        [legacyLineIds[0]],
      );
      await current.query(
        "UPDATE order_items SET unit_cost_cents = NULL WHERE id = $1",
        [legacyLineIds[0]],
      );
      expect(await legacyCosts()).toEqual([null, null]);
    });

    it("a restricted role granted before the column existed writes and reads it only for its tenant", async () => {
      await migrateToLatest();
      const lineId = randomUUID();

      await runWithTenant(tenant, () =>
        app.getRepository(OrderItem).insert({
          id: lineId,
          order_id: orderId,
          product_id: productId,
          product_name: "Legacy beans",
          unit_price_cents: 500,
          unit_cost_cents: 120,
          qty: 1,
          line_total_cents: 500,
          user_id: tenant,
        }),
      );

      expect(
        await runWithTenant(tenant, () =>
          app.getRepository(OrderItem).findOneBy({ id: lineId }),
        ),
      ).toMatchObject({ unit_cost_cents: 120 });
      expect(
        await runWithTenant(otherTenant, () =>
          app.getRepository(OrderItem).findOneBy({ id: lineId }),
        ),
      ).toBeNull();
      await current.query("DELETE FROM order_items WHERE id = $1", [lineId]);
    });

    it("reverts by dropping only the column, and re-applies with legacy lines still unknown", async () => {
      await migrateToLatest();

      await current.undoLastMigration({ transaction: "all" });

      expect(await columnInfo()).toEqual([]);
      expect(await costConstraint()).toEqual([]);
      expect(
        await current.query(
          "SELECT count(*)::int AS n FROM order_items WHERE id = ANY($1::uuid[])",
          [legacyLineIds],
        ),
      ).toEqual([{ n: 2 }]);
      expect(await current.showMigrations()).toBe(true);

      const reapplied = await migrateToLatest();

      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await columnInfo()).toEqual([
        { data_type: "integer", is_nullable: "YES" },
      ]);
      expect(await legacyCosts()).toEqual([null, null]);
      expect(await orderItemPolicies()).toEqual(policiesBefore);
    });
  },
);
