import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { formatDocumentNumber } from "../src/modules/receipts/receipt-number";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const FORMAT_FILE = "1793400000000-DocumentNumberingFormat.ts";
const SIGNOFF_FILE = "1793500000000-DocumentSignoffAssets.ts";
const FORMAT = "DocumentNumberingFormat1793400000000";
const SIGNOFF = "DocumentSignoffAssets1793500000000";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * The two stage-5 migrations on a database built by the previous release: they only
 * add, existing accounts keep their numbers, and both revert and re-apply with data.
 */
describeIsolatedPostgres(
  "document numbering format and signoff assets migrations on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const database = `audit_fmt_mig_${process.pid}_${Date.now()}`;
    const veteran = randomUUID();
    const logoAsset = randomUUID();
    let root: Client;
    let previous: DataSource;
    let current: DataSource;

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".ts") && file <= SIGNOFF_FILE)
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

    const columns = async (table: string) =>
      (
        await current.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table],
        )
      ).map((row: { column_name: string }) => row.column_name);

    const definition = async (name: string) =>
      (
        await current.query(
          `SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = $1`,
          [name],
        )
      )[0]?.def as string | undefined;

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      previous = await source(
        files.filter((file) => file !== FORMAT_FILE && file !== SIGNOFF_FILE),
      );
      await previous.runMigrations({ transaction: "all" });

      await previous.query(
        `INSERT INTO users (id, email, password, receipt_counter) VALUES ($1, $2, 'fixture', 0)`,
        [veteran, `${veteran}@migration.invalid`],
      );
      await previous.query(`INSERT INTO user_settings ("userId") VALUES ($1)`, [
        veteran,
      ]);
      await previous.query(
        `INSERT INTO document_counters (user_id, document_type, value) VALUES ($1, 'invoice', 41)`,
        [veteran],
      );
      await previous.query(
        `INSERT INTO document_assets (id, user_id, object_key, sha256, bytes, width, height, state, lease_expires_at)
         VALUES ($1, $2, $3, repeat('a', 64), 100, 600, 200, 'ready', now())`,
        [logoAsset, veteran, `logos/${veteran}/${logoAsset}.png`],
      );
      await previous.query(
        `UPDATE user_settings SET logo_asset_id = $2 WHERE "userId" = $1`,
        [veteran, logoAsset],
      );
      current = await source(files);
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [current, previous],
        admin: root,
        databases: [database],
        roles: [],
      }),
    );

    it("applies exactly these two migrations", async () => {
      const applied = await current.runMigrations({ transaction: "all" });
      expect(applied.map((migration) => migration.name)).toEqual([
        FORMAT,
        SIGNOFF,
      ]);
      expect(await current.showMigrations()).toBe(false);
    });

    it("leaves an existing account's numbers exactly as they were", async () => {
      await current.runMigrations({ transaction: "all" });
      const [row] = await current.query(
        `SELECT value, prefix, padding, include_year FROM document_counters WHERE user_id = $1`,
        [veteran],
      );

      expect(row).toEqual({
        value: 41,
        prefix: "",
        padding: 6,
        include_year: true,
      });
      expect(
        formatDocumentNumber(
          {
            prefix: row.prefix,
            padding: row.padding,
            includeYear: row.include_year,
          },
          42,
          2026,
        ),
      ).toBe("2026-000042");
    });

    it("keeps existing assets as logos and accepts wider signatures", async () => {
      await current.runMigrations({ transaction: "all" });

      expect(
        await current.query(`SELECT kind FROM document_assets WHERE id = $1`, [
          logoAsset,
        ]),
      ).toEqual([{ kind: "logo" }]);
      const insert = (width: number, kind = "signature") =>
        current.query(
          `INSERT INTO document_assets (id, user_id, object_key, sha256, bytes, width, height, state, lease_expires_at, kind)
           VALUES ($1, $2, $3, repeat('b', 64), 100, $4, 100, 'ready', now(), $5)`,
          [randomUUID(), veteran, `signoffs/${randomUUID()}.png`, width, kind],
        );
      await insert(800);
      await expect(insert(801)).rejects.toMatchObject({ code: "23514" });
      await expect(insert(100, "banner")).rejects.toMatchObject({
        code: "23514",
      });
    });

    it("enforces the prefix and padding rules in the database", async () => {
      await current.runMigrations({ transaction: "all" });
      const attempt = (prefix: string, padding = 6) =>
        current.query(
          `UPDATE document_counters SET prefix = $2, padding = $3 WHERE user_id = $1`,
          [veteran, prefix, padding],
        );

      for (const bad of ["A1", "A/B", 'A"B', "A\\B", "A\u0007"])
        await expect(attempt(bad)).rejects.toMatchObject({ code: "23514" });
      await expect(attempt("A", 0)).rejects.toMatchObject({ code: "23514" });
      await expect(attempt("A", 10)).rejects.toMatchObject({ code: "23514" });
      await expect(attempt("A".repeat(17))).rejects.toMatchObject({
        code: "22001",
      });
      await attempt("РФ-", 9);
      await attempt("", 6);
    });

    it("reverts both, dropping signature rows and restoring the older logo rule, and re-applies", async () => {
      await current.runMigrations({ transaction: "all" });
      await current.query(
        `UPDATE document_counters SET prefix = 'ТМП-' WHERE user_id = $1`,
        [veteran],
      );
      const signature = randomUUID();
      await current.query(
        `INSERT INTO document_assets (id, user_id, object_key, sha256, bytes, width, height, state, lease_expires_at, kind)
         VALUES ($1, $2, $3, repeat('c', 64), 100, 800, 300, 'ready', now(), 'signature')`,
        [signature, veteran, `signoffs/${veteran}/${signature}.png`],
      );
      await current.query(
        `UPDATE user_settings SET signature_asset_id = $2 WHERE "userId" = $1`,
        [veteran, signature],
      );

      await current.undoLastMigration({ transaction: "all" });
      await current.undoLastMigration({ transaction: "all" });

      expect(await columns("document_counters")).not.toEqual(
        expect.arrayContaining(["prefix"]),
      );
      expect(await columns("user_settings")).not.toEqual(
        expect.arrayContaining(["signature_asset_id"]),
      );
      expect(await columns("document_assets")).not.toContain("kind");
      expect(
        await definition("document_settings_signoff_owner"),
      ).toBeUndefined();
      expect(await definition("document_settings_logo_owner")).not.toContain(
        "kind",
      );
      // The logo survived; only signature and stamp rows were dropped.
      expect(
        (
          await current.query(
            `SELECT id FROM document_assets WHERE user_id = $1`,
            [veteran],
          )
        ).map((row: { id: string }) => row.id),
      ).toEqual([logoAsset]);
      expect(
        (
          await current.query(
            `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'document_assets'`,
          )
        )[0].relforcerowsecurity,
      ).toBe(true);
      await expect(
        current.query(
          `INSERT INTO document_assets (id, user_id, object_key, sha256, bytes, width, height, state, lease_expires_at)
           VALUES ($1, $2, 'x', repeat('d', 64), 1, 601, 1, 'ready', now())`,
          [randomUUID(), veteran],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      // The counter value survived the round trip.
      expect(
        (
          await current.query(
            `SELECT value FROM document_counters WHERE user_id = $1`,
            [veteran],
          )
        )[0].value,
      ).toBe(41);

      const reapplied = await current.runMigrations({ transaction: "all" });
      expect(reapplied.map((migration) => migration.name)).toEqual([
        FORMAT,
        SIGNOFF,
      ]);
      expect(
        (
          await current.query(
            `SELECT prefix FROM document_counters WHERE user_id = $1`,
            [veteran],
          )
        )[0].prefix,
      ).toBe("");
    });
  },
);
