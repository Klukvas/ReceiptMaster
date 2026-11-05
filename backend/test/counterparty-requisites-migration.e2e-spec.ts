import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { applyRuntimeGrants } from "./helpers/db-roles";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1793000000000-AddCounterpartyRequisites.ts";
const NEW_MIGRATION = "AddCounterpartyRequisites1793000000000";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];
const VALID_IBAN = "UA213223130000026007233566001";

const SETTINGS_COLUMNS = [
  "companyTaxIdKind",
  "companyLegalForm",
  "companyBankName",
  "companyVatPayer",
  "companyVatId",
  "companySignatoryName",
  "companySignatoryPosition",
  "defaultPaymentTermDays",
];
const RECIPIENT_COLUMNS = [
  "legal_name",
  "tax_id",
  "tax_id_kind",
  "iban",
  "bank_name",
  "legal_address",
];

/**
 * Seller and buyer requisites are optional columns. The migration runs on a database built
 * by the previous release, must leave existing rows untouched, enforce its CHECKs, and
 * revert cleanly.
 */
describeIsolatedPostgres(
  "counterparty requisites migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_requisites_${suffix}`;
    const tenant = randomUUID();
    const legacyRecipient = randomUUID();
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

    const columnsOf = async (table: string) =>
      (
        await current.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table],
        )
      ).map((row: { column_name: string }) => row.column_name);

    const insertRecipient = (fields: Record<string, unknown>) => {
      const names = Object.keys(fields);
      return current.query(
        `INSERT INTO recipients (id, name, user_id, ${names.map((n) => `"${n}"`).join(", ")})
         VALUES ($1, 'Buyer', $2, ${names.map((_, i) => `$${i + 3}`).join(", ")})`,
        [randomUUID(), tenant, ...Object.values(fields)],
      );
    };

    const updateSettings = (column: string, value: unknown) =>
      current.query(
        `UPDATE user_settings SET "${column}" = $1 WHERE "userId" = $2`,
        [value, tenant],
      );

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);

      previous = await ownerSource(
        migrationFiles.filter((file) => file !== NEW_MIGRATION_FILE),
      );
      await previous.runMigrations({ transaction: "all" });
      await previous.query(
        `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
        [tenant, `${tenant}@migration.invalid`],
      );
      await previous.query(
        `INSERT INTO user_settings (id, "userId", "companyName", "companyTaxId", "companyIban")
         VALUES ($1, $2, 'Legacy LLC', 'free text tax id', 'not an iban')`,
        [randomUUID(), tenant],
      );
      await previous.query(
        `INSERT INTO recipients (id, name, user_id) VALUES ($1, 'Legacy', $2)`,
        [legacyRecipient, tenant],
      );

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

    it("is the only pending migration and leaves existing rows with NULL requisites", async () => {
      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await current.showMigrations()).toBe(false);
      expect(await columnsOf("user_settings")).toEqual(
        expect.arrayContaining(SETTINGS_COLUMNS),
      );
      expect(await columnsOf("recipients")).toEqual(
        expect.arrayContaining(RECIPIENT_COLUMNS),
      );
      const [settings] = await current.query(
        `SELECT * FROM user_settings WHERE "userId" = $1`,
        [tenant],
      );
      expect(settings.companyTaxId).toBe("free text tax id");
      expect(settings.companyIban).toBe("not an iban");
      for (const column of SETTINGS_COLUMNS)
        expect(settings[column]).toBeNull();
      const [recipient] = await current.query(
        `SELECT * FROM recipients WHERE id = $1`,
        [legacyRecipient],
      );
      for (const column of RECIPIENT_COLUMNS)
        expect(recipient[column]).toBeNull();
    });

    it("accepts valid seller requisites and rejects invalid ones", async () => {
      await migrateToLatest();

      await updateSettings("companyTaxIdKind", "rnokpp");
      await updateSettings("companyVatId", "1234567890");
      await updateSettings("companyVatId", "123456789012");
      await updateSettings("defaultPaymentTermDays", 365);
      await updateSettings("companyVatPayer", false);

      await expect(
        updateSettings("companyTaxIdKind", "other"),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "CHK_user_settings_tax_id_kind",
      });
      await expect(
        updateSettings("companyVatId", "12345678901"),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "CHK_user_settings_vat_id",
      });
      await expect(
        updateSettings("defaultPaymentTermDays", 0),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "CHK_user_settings_payment_term_days",
      });
      await expect(
        updateSettings("defaultPaymentTermDays", 366),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "CHK_user_settings_payment_term_days",
      });
    });

    it("accepts valid buyer requisites and rejects invalid ones", async () => {
      await migrateToLatest();

      await insertRecipient({
        tax_id: "12345678",
        tax_id_kind: "edrpou",
        iban: VALID_IBAN,
      });
      await insertRecipient({ tax_id: "1234567890", tax_id_kind: "rnokpp" });
      await insertRecipient({ legal_name: "No tax id" });

      const rejected = (fields: Record<string, unknown>, constraint: string) =>
        expect(insertRecipient(fields)).rejects.toMatchObject({
          code: "23514",
          constraint,
        });
      await rejected(
        { tax_id: "1234567", tax_id_kind: "edrpou" },
        "CHK_recipients_tax_id",
      );
      await rejected(
        { tax_id: "1234567a", tax_id_kind: "edrpou" },
        "CHK_recipients_tax_id",
      );
      await rejected({ tax_id: "12345678" }, "CHK_recipients_tax_id_with_kind");
      await rejected(
        { tax_id_kind: "edrpou" },
        "CHK_recipients_tax_id_with_kind",
      );
      await rejected(
        { tax_id: "12345678", tax_id_kind: "rnokpp" },
        "CHK_recipients_tax_id_kind_length",
      );
      await rejected(
        { tax_id: "1234567890", tax_id_kind: "edrpou" },
        "CHK_recipients_tax_id_kind_length",
      );
      await rejected(
        { tax_id: "12345678", tax_id_kind: "vat" },
        "CHK_recipients_tax_id_kind",
      );
      await rejected({ iban: "DE89370400440532013000" }, "CHK_recipients_iban");
      await rejected({ iban: VALID_IBAN.toLowerCase() }, "CHK_recipients_iban");
    });

    it("lets the restricted application role write requisites for its own tenant", async () => {
      await migrateToLatest();
      const role = `audit_requisites_app_${suffix}`;
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
        await app.query("BEGIN");
        await app.query(`SELECT set_config('app.current_user_id', $1, true)`, [
          tenant,
        ]);
        await app.query(
          `UPDATE user_settings SET "companyVatId" = '1234567890', "defaultPaymentTermDays" = 14 WHERE "userId" = $1`,
          [tenant],
        );
        await app.query(
          `UPDATE recipients SET legal_name = 'Buyer LLC', tax_id = '12345678', tax_id_kind = 'edrpou', iban = $1 WHERE id = $2`,
          [VALID_IBAN, legacyRecipient],
        );
        await app.query("COMMIT");

        const [recipient] = (
          await app
            .query(`SELECT set_config('app.current_user_id', $1, false)`, [
              tenant,
            ])
            .then(() =>
              app.query(
                `SELECT legal_name, iban FROM recipients WHERE id = $1`,
                [legacyRecipient],
              ),
            )
        ).rows;
        expect(recipient).toEqual({
          legal_name: "Buyer LLC",
          iban: VALID_IBAN,
        });

        await app.query(`SELECT set_config('app.current_user_id', $1, false)`, [
          randomUUID(),
        ]);
        const foreign = await app.query(
          `UPDATE recipients SET legal_name = 'Hijacked' WHERE id = $1`,
          [legacyRecipient],
        );
        expect(foreign.rowCount).toBe(0);
      } finally {
        await app.end();
      }
    });

    it("reverts to the previous schema and re-applies", async () => {
      await migrateToLatest();

      await current.undoLastMigration({ transaction: "all" });

      expect(await columnsOf("user_settings")).not.toEqual(
        expect.arrayContaining([SETTINGS_COLUMNS[0]]),
      );
      for (const column of RECIPIENT_COLUMNS)
        expect(await columnsOf("recipients")).not.toContain(column);
      expect(
        await current.query(
          `SELECT conname FROM pg_constraint WHERE conname LIKE 'CHK_recipients_%' OR conname LIKE 'CHK_user_settings_%'`,
        ),
      ).toEqual([]);

      const reapplied = await migrateToLatest();

      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
    });
  },
);
