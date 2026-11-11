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
const RLS_FILE = "1793900000000-SuppliersRowLevelSecurity.ts";
const RLS_MIGRATION = "SuppliersRowLevelSecurity1793900000000";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * Suppliers row security on a database built by the previous release that already holds a
 * product linked to another account's supplier (never assume clean data): the link is cut,
 * own links stay, and a non-owner role then sees and writes only the current tenant's
 * suppliers. down/up work.
 */
describeIsolatedPostgres(
  "suppliers row security migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const database = `audit_suppliers_rls_${process.pid}_${Date.now()}`;
    const runtimeRole = `audit_suppliers_app_${process.pid}`;
    const owner = randomUUID();
    const neighbour = randomUUID();
    const ownSupplier = randomUUID();
    const ownProduct = randomUUID();
    const foreignLinkedProduct = randomUUID();
    let root: Client;
    let previous: DataSource;
    let current: DataSource;

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".ts") && file <= RLS_FILE)
      .sort();

    const source = (list: string[]) =>
      new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database,
        entities: ENTITIES,
        migrations: list.map((file) => join(MIGRATIONS_DIR, file)),
        synchronize: false,
      }).initialize();

    const insertProduct = (id: string, userId: string, supplierId: string) =>
      previous.query(
        `INSERT INTO products (id, name, purchase_price_cents, sale_price_cents, quantity, currency, user_id, supplier_id)
         VALUES ($1, $2, 100, 500, 10, 'UAH', $3, $4)`,
        [id, `Beans ${id}`, userId, supplierId],
      );

    const supplierOf = async (productId: string) =>
      (
        await current.query(`SELECT supplier_id FROM products WHERE id = $1`, [
          productId,
        ])
      )[0].supplier_id;

    /** Runs `work` as the restricted runtime role inside the given tenant. */
    const asTenant = async <T>(
      tenant: string,
      work: (
        run: (sql: string, params?: unknown[]) => Promise<unknown>,
      ) => Promise<T>,
    ): Promise<T> => {
      const runner = current.createQueryRunner();
      await runner.startTransaction();
      try {
        await runner.query(`SET LOCAL ROLE "${runtimeRole}"`);
        await runner.query(
          `SELECT set_config('app.current_user_id', $1, true)`,
          [tenant],
        );
        return await work((sql, params) => runner.query(sql, params));
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    };

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      previous = await source(files.filter((file) => file !== RLS_FILE));
      await previous.runMigrations({ transaction: "all" });
      for (const id of [owner, neighbour])
        await previous.query(
          `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
          [id, `${id}@migration.invalid`],
        );
      await previous.query(
        `INSERT INTO suppliers (id, name, user_id) VALUES ($1, 'Roastery', $2)`,
        [ownSupplier, owner],
      );
      await insertProduct(ownProduct, owner, ownSupplier);
      // Possible before ProductsService checked supplier ownership.
      await insertProduct(foreignLinkedProduct, neighbour, ownSupplier);
      await root.query(`CREATE ROLE "${runtimeRole}" NOLOGIN`);
      current = await source(files);
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [current, previous],
        admin: root,
        databases: [database],
        roles: [runtimeRole],
      }),
    );

    it("is the only pending migration and unlinks only the cross-tenant supplier", async () => {
      const applied = await current.runMigrations({ transaction: "all" });
      expect(applied.map((migration) => migration.name)).toEqual([
        RLS_MIGRATION,
      ]);
      expect(await supplierOf(ownProduct)).toBe(ownSupplier);
      expect(await supplierOf(foreignLinkedProduct)).toBeNull();
      // 03-grants.sql gives rm_app the same table rights.
      await current.query(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
      await current.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO "${runtimeRole}"`,
      );
    });

    it("lets the runtime role see and write only the current tenant's suppliers", async () => {
      const seen = (tenant: string) =>
        asTenant(tenant, (run) => run(`SELECT id FROM suppliers`));
      expect(await seen(owner)).toEqual([{ id: ownSupplier }]);
      expect(await seen(neighbour)).toEqual([]);

      await expect(
        asTenant(neighbour, (run) =>
          run(
            `INSERT INTO suppliers (id, name, user_id) VALUES ($1, 'Fake', $2)`,
            [randomUUID(), owner],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asTenant(neighbour, (run) =>
          run(`DELETE FROM suppliers WHERE id = $1 RETURNING id`, [
            ownSupplier,
          ]),
        ),
      ).resolves.toEqual([[], 0]); // TypeORM's [rows, affected] for a DELETE: nothing deleted
    });

    it("reverts and applies again", async () => {
      const rowSecurity = async () =>
        (
          await current.query(
            `SELECT relrowsecurity FROM pg_class WHERE relname = 'suppliers'`,
          )
        )[0].relrowsecurity;

      await current.undoLastMigration({ transaction: "all" });
      expect(await rowSecurity()).toBe(false);

      await current.runMigrations({ transaction: "all" });
      expect(await rowSecurity()).toBe(true);
      expect(await supplierOf(ownProduct)).toBe(ownSupplier);
    });
  },
);
