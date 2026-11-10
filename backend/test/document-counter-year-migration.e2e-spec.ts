import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const YEAR_FILE = "1793700000000-DocumentCounterYear.ts";
const YEAR_MIGRATION = "DocumentCounterYear1793700000000";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * The yearly-reset migration on a database built by the previous release: it only adds,
 * existing accounts keep their counters and formats, and it reverts and re-applies with
 * data, also as an owner role that row security filters (the production owner).
 */
describeIsolatedPostgres(
  "document counter year migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_year_mig_${suffix}`;
    const ownerRole = `year_owner_${suffix}`;
    const veteran = randomUUID(); // invoice 41, waybill 9 (legacy counter 12), hand-made numbers
    const newcomer = randomUUID(); // never generated anything
    let root: Client;
    let previous: DataSource;
    let current: DataSource;

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".ts") && file <= YEAR_FILE)
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

    const counter = async (userId: string, type: string) =>
      (
        await current.query(
          `SELECT value, prefix, padding, include_year FROM document_counters
           WHERE user_id = $1 AND document_type = $2`,
          [userId, type],
        )
      )[0];

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      previous = await source(files.filter((file) => file !== YEAR_FILE));
      await previous.runMigrations({ transaction: "all" });

      await previous.query(
        `INSERT INTO users (id, email, password, receipt_counter) VALUES
           ($1, $2, 'fixture', 12), ($3, $4, 'fixture', 0)`,
        [
          veteran,
          `${veteran}@migration.invalid`,
          newcomer,
          `${newcomer}@migration.invalid`,
        ],
      );
      await previous.query(
        `INSERT INTO document_counters (user_id, document_type, value, prefix, padding, include_year)
         VALUES ($1, 'invoice', 41, 'РФ-', 4, true), ($1, 'waybill', 9, '', 6, true)`,
        [veteran],
      );
      current = await source(files);
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [current, previous],
        admin: root,
        databases: [database],
        roles: [ownerRole],
      }),
    );

    it("is the only pending migration", async () => {
      const applied = await current.runMigrations({ transaction: "all" });
      expect(applied.map((migration) => migration.name)).toEqual([
        YEAR_MIGRATION,
      ]);
      expect(await current.showMigrations()).toBe(false);
    });

    it("leaves every existing counter and format as it was, with the reset off", async () => {
      await current.runMigrations({ transaction: "all" });

      expect(await counter(veteran, "invoice")).toEqual({
        value: 41,
        prefix: "РФ-",
        padding: 4,
        include_year: true,
      });
      expect(await counter(veteran, "waybill")).toMatchObject({ value: 9 });
      expect(
        await current.query(
          `SELECT reset_every_year, start_number FROM document_counters`,
        ),
      ).toEqual(
        expect.arrayContaining([{ reset_every_year: false, start_number: 1 }]),
      );
      expect(
        await current.query(
          `SELECT count(*)::int AS rows FROM document_counters
           WHERE reset_every_year OR start_number <> 1`,
        ),
      ).toEqual([{ rows: 0 }]);
      expect(
        await current.query(
          `SELECT count(*)::int AS rows FROM document_year_counters`,
        ),
      ).toEqual([{ rows: 0 }]);
      expect(
        (
          await current.query(
            `SELECT receipt_counter FROM users WHERE id = $1`,
            [veteran],
          )
        )[0].receipt_counter,
      ).toBe(12);
    });

    it("keeps row security forced on the yearly counters, with the tenant policy", async () => {
      await current.runMigrations({ transaction: "all" });

      expect(
        await current.query(
          `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'document_year_counters'`,
        ),
      ).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
      expect(
        await current.query(
          `SELECT policyname FROM pg_policies WHERE tablename = 'document_year_counters'`,
        ),
      ).toEqual([{ policyname: "tenant_isolation" }]);
    });

    it("enforces the reset and start rules in the database", async () => {
      await current.runMigrations({ transaction: "all" });
      const attempt = (set: string) =>
        current.query(
          `UPDATE document_counters SET ${set} WHERE user_id = $1 AND document_type = 'invoice'`,
          [veteran],
        );

      await expect(
        attempt("reset_every_year = true, include_year = false"),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(attempt("start_number = 0")).rejects.toMatchObject({
        code: "23514",
      });
      await expect(attempt("start_number = 2000000001")).rejects.toMatchObject({
        code: "23514",
      });
      await expect(
        current.query(
          `INSERT INTO document_year_counters (user_id, document_type, year, value) VALUES ($1, 'invoice', 999, 1)`,
          [veteran],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        current.query(
          `INSERT INTO document_year_counters (user_id, document_type, year, value) VALUES ($1, 'invoice', 2026, -1)`,
          [veteran],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await attempt("reset_every_year = true, start_number = 100");
      await attempt("reset_every_year = false, start_number = 1");
    });

    it("reverts as a row-security-filtered owner, keeping numbers ahead of the yearly counters, and re-applies", async () => {
      await current.runMigrations({ transaction: "all" });
      await current.query(
        `UPDATE document_counters SET reset_every_year = true, start_number = 7
         WHERE user_id = $1 AND document_type IN ('invoice', 'waybill')`,
        [veteran],
      );
      await current.query(
        `INSERT INTO document_year_counters (user_id, document_type, year, value) VALUES
           ($1, 'invoice', 2026, 60), ($1, 'invoice', 2027, 3), ($1, 'waybill', 2027, 30),
           ($2, 'act', 2027, 5)`,
        [veteran, newcomer],
      );

      // The production owner is neither a superuser nor BYPASSRLS, so FORCE RLS hides rows from it.
      const password = await createRestrictedRole(root, ownerRole);
      await current.query(
        `GRANT USAGE ON SCHEMA public TO "${ownerRole}";
         GRANT ALL ON TABLE migrations TO "${ownerRole}";
         ALTER TABLE document_counters OWNER TO "${ownerRole}";
         ALTER TABLE document_year_counters OWNER TO "${ownerRole}";
         ALTER TABLE users OWNER TO "${ownerRole}"`,
      );
      const asOwner = await new DataSource({
        type: "postgres",
        host: connection.host,
        port: connection.port,
        username: ownerRole,
        password,
        database,
        entities: ENTITIES,
        migrations: files.map((file) => join(MIGRATIONS_DIR, file)),
        synchronize: false,
      }).initialize();
      try {
        await asOwner.undoLastMigration({ transaction: "all" });
      } finally {
        await asOwner.destroy();
      }

      expect(
        await current.query(
          `SELECT to_regclass('document_year_counters') AS present`,
        ),
      ).toEqual([{ present: null }]);
      expect(
        (
          await current.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = 'document_counters' AND column_name IN ('reset_every_year', 'start_number')`,
          )
        ).length,
      ).toBe(0);
      expect(
        await current.query(
          `SELECT policyname FROM pg_policies WHERE tablename = 'document_counters'`,
        ),
      ).toEqual([{ policyname: "tenant_isolation" }]);
      // The highest yearly value is now the floor of the flat counter and of the legacy one.
      expect(await counter(veteran, "invoice")).toMatchObject({ value: 60 });
      expect(await counter(veteran, "waybill")).toMatchObject({ value: 30 });
      expect(
        (
          await current.query(
            `SELECT receipt_counter FROM users WHERE id = $1`,
            [veteran],
          )
        )[0].receipt_counter,
      ).toBe(30);
      expect(
        (
          await current.query(
            `SELECT receipt_counter FROM users WHERE id = $1`,
            [newcomer],
          )
        )[0].receipt_counter,
      ).toBe(0);
      expect(
        (
          await current.query(
            `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'document_counters'`,
          )
        )[0].relforcerowsecurity,
      ).toBe(true);

      // Hand ownership back, then apply again: the round trip leaves the same fresh state.
      await current.query(
        `ALTER TABLE document_counters OWNER TO "${connection.user}";
         ALTER TABLE users OWNER TO "${connection.user}"`,
      );
      const reapplied = await current.runMigrations({ transaction: "all" });
      expect(reapplied.map((migration) => migration.name)).toEqual([
        YEAR_MIGRATION,
      ]);
      expect(
        await current.query(
          `SELECT count(*)::int AS rows FROM document_year_counters`,
        ),
      ).toEqual([{ rows: 0 }]);
      expect(await counter(veteran, "invoice")).toMatchObject({
        value: 60,
        prefix: "РФ-",
      });
      expect(
        await current.query(
          `SELECT count(*)::int AS rows FROM document_counters WHERE reset_every_year`,
        ),
      ).toEqual([{ rows: 0 }]);
    });
  },
);
