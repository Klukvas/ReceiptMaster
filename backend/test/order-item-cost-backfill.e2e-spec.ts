import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Logger } from "@nestjs/common";
import { Client } from "pg";
import { DataSource, QueryRunner } from "typeorm";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { installTenantContext } from "../src/common/tenancy/tenant-data-source";
import { BackfillOrderItemUnitCost1792310000000 } from "../src/config/migrations/1792310000000-BackfillOrderItemUnitCost";
import { KNOWN_COST_PROFIT_SQL } from "../src/modules/orders/dashboard-profit";
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
const BACKFILL_FILE = "1792310000000-BackfillOrderItemUnitCost.ts";
const BACKFILL = "BackfillOrderItemUnitCost1792310000000";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

type LineState = { cost: number | null; estimated: boolean };

/**
 * The release path of the backfill on a fresh database: the chain up to the
 * previous release, lines written by it (with and without a real snapshot), then
 * the migration, its revert, and a re-apply. Owner connections run migrations.
 */
describeIsolatedPostgres(
  "order_items cost backfill migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_cost_backfill_${suffix}`;
    const appRole = `audit_backfill_app_${suffix}`;
    const ownerRole = `audit_backfill_owner_${suffix}`;
    const tenant = randomUUID();
    const rival = randomUUID();
    const line = {
      confirmed: randomUUID(),
      snapshot: randomUUID(),
      softDeletedProduct: randomUUID(),
      freeProduct: randomUUID(),
      negativeProduct: randomUUID(),
      draft: randomUUID(),
      cancelled: randomUUID(),
      softDeletedOrder: randomUUID(),
      rival: randomUUID(),
    };
    const product = {
      beans: randomUUID(),
      cups: randomUUID(),
      retired: randomUUID(),
      free: randomUUID(),
      negative: randomUUID(),
      rival: randomUUID(),
    };
    const order = {
      confirmed: randomUUID(),
      draft: randomUUID(),
      cancelled: randomUUID(),
      softDeleted: randomUUID(),
      rival: randomUUID(),
    };
    const estimated = (cost: number): LineState => ({ cost, estimated: true });
    const AFTER_BACKFILL: Record<string, LineState> = {
      [line.confirmed]: estimated(100),
      [line.snapshot]: { cost: 120, estimated: false },
      [line.softDeletedProduct]: estimated(70),
      [line.freeProduct]: estimated(0),
      [line.negativeProduct]: { cost: null, estimated: false },
      [line.draft]: estimated(100),
      [line.cancelled]: estimated(100),
      [line.softDeletedOrder]: estimated(100),
      [line.rival]: estimated(200),
    };
    const BEFORE_BACKFILL = Object.fromEntries(
      Object.keys(AFTER_BACKFILL).map((id) => [
        id,
        id === line.snapshot ? 120 : null,
      ]),
    );

    let root: Client;
    let previous: DataSource;
    let current: DataSource;
    let app: DataSource;
    let owner: DataSource;

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

    const roleSource = (username: string, password: string) =>
      new DataSource({
        type: "postgres",
        host: connection.host,
        port: connection.port,
        username,
        password,
        database,
        entities: ENTITIES,
        extra: { max: 2 },
      }).initialize();

    const apply = () => current.runMigrations({ transaction: "all" });

    const revert = async () => {
      if (!(await current.showMigrations()))
        await current.undoLastMigration({ transaction: "all" });
    };

    const lineStates = async (): Promise<Record<string, LineState>> => {
      const rows: Array<{
        id: string;
        unit_cost_cents: number | null;
        unit_cost_estimated: boolean;
      }> = await current.query(
        "SELECT id, unit_cost_cents, unit_cost_estimated FROM order_items WHERE id = ANY($1::uuid[])",
        [Object.keys(AFTER_BACKFILL)],
      );
      return Object.fromEntries(
        rows.map((row) => [
          row.id,
          { cost: row.unit_cost_cents, estimated: row.unit_cost_estimated },
        ]),
      );
    };

    const lineCosts = async (): Promise<Record<string, number | null>> => {
      const rows: Array<{ id: string; unit_cost_cents: number | null }> =
        await current.query(
          "SELECT id, unit_cost_cents FROM order_items WHERE id = ANY($1::uuid[])",
          [Object.keys(AFTER_BACKFILL)],
        );
      return Object.fromEntries(
        rows.map((row) => [row.id, row.unit_cost_cents]),
      );
    };

    const flagColumn = () =>
      current.query(
        `SELECT data_type, is_nullable, column_default FROM information_schema.columns
         WHERE table_name = 'order_items' AND column_name = 'unit_cost_estimated'`,
      );

    const seedPreviousRelease = async () => {
      for (const id of [tenant, rival]) {
        await previous.query(
          `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
          [id, `${id}@backfill.invalid`],
        );
        await previous.query(
          `INSERT INTO recipients (id, name, user_id) VALUES ($1, 'Buyer', $1)`,
          [id],
        );
      }
      const products: Array<[string, number, string]> = [
        [product.beans, 100, tenant],
        [product.cups, 300, tenant],
        [product.retired, 70, tenant],
        [product.free, 0, tenant],
        [product.negative, -5, tenant],
        [product.rival, 200, rival],
      ];
      for (const [id, cost, owningTenant] of products)
        await previous.query(
          `INSERT INTO products (id, name, purchase_price_cents, sale_price_cents, quantity, currency, user_id, deleted_at)
           VALUES ($1::uuid, $1::text, $2, 500, 10, 'UAH', $3, CASE WHEN $1::uuid = $4::uuid THEN now() END)`,
          [id, cost, owningTenant, product.retired],
        );
      const orders: Array<[string, string, string, boolean]> = [
        [order.confirmed, "confirmed", tenant, false],
        [order.draft, "draft", tenant, false],
        [order.cancelled, "cancelled", tenant, false],
        [order.softDeleted, "confirmed", tenant, true],
        [order.rival, "confirmed", rival, false],
      ];
      for (const [id, status, owningTenant, softDeleted] of orders)
        await previous.query(
          `INSERT INTO orders (id, recipient_id, status, subtotal_cents, total_cents, currency, user_id, deleted_at)
           VALUES ($1, $2, $3, 0, 0, 'UAH', $2, CASE WHEN $4 THEN now() END)`,
          [id, owningTenant, status, softDeleted],
        );
      const lines: Array<[string, string, string, number, number | null]> = [
        [line.confirmed, order.confirmed, product.beans, 2, null],
        [line.snapshot, order.confirmed, product.cups, 3, 120],
        [line.softDeletedProduct, order.confirmed, product.retired, 1, null],
        [line.freeProduct, order.confirmed, product.free, 4, null],
        [line.negativeProduct, order.confirmed, product.negative, 1, null],
        [line.draft, order.draft, product.beans, 1, null],
        [line.cancelled, order.cancelled, product.beans, 5, null],
        [line.softDeletedOrder, order.softDeleted, product.beans, 6, null],
        [line.rival, order.rival, product.rival, 2, null],
      ];
      for (const [id, orderId, productId, qty, cost] of lines)
        await previous.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_cents, qty, line_total_cents, user_id, unit_cost_cents)
           SELECT $1, $2, $3, 'Product', 500, $4::int, 500 * $4::int, o.user_id, $5
           FROM orders o WHERE o.id = $2`,
          [id, orderId, productId, qty, cost],
        );
    };

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      const appPassword = await createRestrictedRole(root, appRole);
      const ownerPassword = await createRestrictedRole(root, ownerRole);

      const migrationFiles = readdirSync(MIGRATIONS_DIR)
        .filter((file) => file.endsWith(".ts") && file <= BACKFILL_FILE)
        .sort();

      // The schema as the previous release left it.
      previous = await ownerSource(
        migrationFiles.filter((file) => file !== BACKFILL_FILE),
      );
      await previous.runMigrations({ transaction: "all" });
      await previous.query(
        `GRANT USAGE ON SCHEMA public TO "${appRole}", "${ownerRole}"`,
      );
      await previous.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${appRole}"`,
      );
      // Forced policies on order_items read receipts and orders as the querying role.
      await previous.query(
        `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${ownerRole}"`,
      );
      await seedPreviousRelease();

      current = await ownerSource(migrationFiles);
      app = installTenantContext(await roleSource(appRole, appPassword));
      owner = await roleSource(ownerRole, ownerPassword);
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [owner, app, current, previous],
        admin: root,
        databases: [database],
        roles: [appRole, ownerRole],
      }),
    );

    afterEach(() => jest.restoreAllMocks());

    it("is the only pending migration, estimates every legacy line and leaves real snapshots alone", async () => {
      expect(await lineCosts()).toEqual(BEFORE_BACKFILL);
      expect(await flagColumn()).toEqual([]);
      const warn = jest.spyOn(Logger.prototype, "warn");

      const applied = await apply();

      expect(warn).not.toHaveBeenCalled();
      expect(applied.map((migration) => migration.name)).toEqual([BACKFILL]);
      expect(await flagColumn()).toEqual([
        {
          data_type: "boolean",
          is_nullable: "NO",
          column_default: "false",
        },
      ]);
      expect(await lineStates()).toEqual(AFTER_BACKFILL);
      expect(await current.showMigrations()).toBe(false);
    });

    it("gives estimated lines the profit of the pre-change formula", async () => {
      await apply();

      const [{ before_change, after_change }] = await current.query(
        `SELECT SUM((oi.unit_price_cents - p.purchase_price_cents) * oi.qty)::int AS before_change,
                (${KNOWN_COST_PROFIT_SQL})::int AS after_change
         FROM order_items oi
         INNER JOIN products p ON p.id = oi.product_id
         WHERE oi.unit_cost_estimated`,
      );

      expect(after_change).toBe(before_change);
      expect(after_change).toBe(
        // beans 400×(2+1+5+6), retired 430, free 500×4, rival 300×2
        400 * 14 + 430 + 2000 + 600,
      );
    });

    it("keeps the estimate when the product's price changes later", async () => {
      await apply();
      const before = await lineStates();

      await current.query(
        "UPDATE products SET purchase_price_cents = purchase_price_cents + 1000",
      );

      try {
        expect(await lineStates()).toEqual(before);
      } finally {
        await current.query(
          "UPDATE products SET purchase_price_cents = purchase_price_cents - 1000",
        );
      }
    });

    it("lets a restricted role read the estimate for its tenant only, never the flag", async () => {
      await apply();

      const own = await runWithTenant(tenant, () =>
        app.getRepository(OrderItem).findOneBy({ id: line.confirmed }),
      );

      expect(own).toMatchObject({ unit_cost_cents: 100 });
      expect(own).not.toHaveProperty("unit_cost_estimated");
      expect(
        await runWithTenant(rival, () =>
          app.getRepository(OrderItem).findOneBy({ id: line.confirmed }),
        ),
      ).toBeNull();
    });

    it("leaves a line on another tenant's product unknown, warns with the count only, and still applies and reverts", async () => {
      await revert();
      const crossTenantLine = randomUUID();
      await current.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_cents, qty, line_total_cents, user_id)
         VALUES ($1, $2, $3, 'Product', 500, 1, 500, $4)`,
        [crossTenantLine, order.confirmed, product.rival, tenant],
      );

      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      try {
        const applied = await apply();

        expect(applied.map((migration) => migration.name)).toEqual([BACKFILL]);
        expect(await current.showMigrations()).toBe(false);
        expect(await lineStates()).toEqual(AFTER_BACKFILL);
        expect(
          await current.query(
            `SELECT unit_cost_cents, unit_cost_estimated FROM order_items WHERE id = $1`,
            [crossTenantLine],
          ),
        ).toEqual([{ unit_cost_cents: null, unit_cost_estimated: false }]);
        expect(warn.mock.calls).toEqual([
          ["1 line(s) point at another tenant's product and stay unknown"],
        ]);

        await current.undoLastMigration({ transaction: "all" });

        expect(await flagColumn()).toEqual([]);
        expect(await lineCosts()).toEqual(BEFORE_BACKFILL);
      } finally {
        await current.query("DELETE FROM order_items WHERE id = $1", [
          crossTenantLine,
        ]);
      }
    });

    it("runs as a non-superuser owner, and refuses when row security would hide the lines from the UPDATE", async () => {
      await revert();
      for (const table of ["order_items", "products"])
        await current.query(`ALTER TABLE ${table} OWNER TO "${ownerRole}"`);
      const migration = new BackfillOrderItemUnitCost1792310000000();
      const inRolledBackTransaction = async (
        run: (runner: QueryRunner) => Promise<unknown>,
      ) => {
        const runner = owner.createQueryRunner();
        await runner.startTransaction();
        try {
          return await run(runner);
        } finally {
          await runner.rollbackTransaction();
          await runner.release();
        }
      };

      try {
        await inRolledBackTransaction((runner) => migration.up(runner));

        for (const table of ["order_items", "products"])
          await current.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

        // With no tenant this role sees no line, so the UPDATE would silently
        // change nothing: that is why row security is refused up front.
        expect(
          await owner.query("SELECT count(*)::int AS n FROM order_items"),
        ).toEqual([{ n: 0 }]);
        await expect(
          inRolledBackTransaction((runner) => migration.up(runner)),
        ).rejects.toThrow(/row security/);
        await expect(
          inRolledBackTransaction((runner) => migration.down(runner)),
        ).rejects.toThrow(/row security/);
      } finally {
        for (const table of ["order_items", "products"]) {
          await current.query(
            `ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`,
          );
          await current.query(
            `ALTER TABLE ${table} OWNER TO "${connection.user}"`,
          );
        }
      }
      expect(await flagColumn()).toEqual([]);
      expect(await lineCosts()).toEqual(BEFORE_BACKFILL);
    });

    it("reverts exactly and re-applies to the same result", async () => {
      await apply();

      await current.undoLastMigration({ transaction: "all" });

      expect(await flagColumn()).toEqual([]);
      expect(await lineCosts()).toEqual(BEFORE_BACKFILL);
      expect(await current.showMigrations()).toBe(true);
      // Why `down` needs the old image first: this entity's INSERT names the column.
      await expect(
        runWithTenant(tenant, () =>
          app.getRepository(OrderItem).insert({
            order_id: order.confirmed,
            product_id: product.beans,
            product_name: "Product",
            unit_price_cents: 500,
            qty: 1,
            line_total_cents: 500,
            user_id: tenant,
          }),
        ),
      ).rejects.toThrow(/unit_cost_estimated/);

      const reapplied = await apply();

      expect(reapplied.map((migration) => migration.name)).toEqual([BACKFILL]);
      expect(await lineStates()).toEqual(AFTER_BACKFILL);
    });
  },
);
