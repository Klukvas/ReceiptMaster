import "reflect-metadata";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { isUniqueViolationOf } from "../src/common/utils/unique-violation.util";
import { RECIPIENT_EMAIL_UNIQUE_INDEX } from "../src/modules/recipients/recipients.service";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const EMAIL_FILE = "1793800000000-RecipientEmailUnique.ts";
const EMAIL_MIGRATION = "RecipientEmailUnique1793800000000";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];

/**
 * The recipient email index on a database built by the previous release that already
 * holds duplicates (never assume clean data): the dedup keeps the newest row's email,
 * the index then refuses a new duplicate under its own name, and down/up work.
 */
describeIsolatedPostgres(
  "recipient email unique migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const database = `audit_recipient_email_${process.pid}_${Date.now()}`;
    const owner = randomUUID();
    const neighbour = randomUUID();
    let root: Client;
    let previous: DataSource;
    let current: DataSource;

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".ts") && file <= EMAIL_FILE)
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

    const insertRecipient = (
      db: DataSource,
      userId: string,
      email: string | null,
      createdAt: string,
    ) =>
      db.query(
        `INSERT INTO recipients (id, user_id, name, email, created_at)
         VALUES ($1, $2, 'Buyer', $3, $4) RETURNING id`,
        [randomUUID(), userId, email, createdAt],
      );

    const emails = async (userId: string) =>
      (
        await current.query(
          `SELECT email, created_at FROM recipients WHERE user_id = $1
           ORDER BY created_at`,
          [userId],
        )
      ).map((row: { email: string | null }) => row.email);

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      previous = await source(files.filter((file) => file !== EMAIL_FILE));
      await previous.runMigrations({ transaction: "all" });
      for (const id of [owner, neighbour])
        await previous.query(
          `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
          [id, `${id}@migration.invalid`],
        );
      // Three spellings of one mailbox for one account, oldest first.
      await insertRecipient(previous, owner, "a@x.test", "2026-01-01");
      await insertRecipient(previous, owner, "A@X.test", "2026-02-01");
      await insertRecipient(previous, owner, "a@x.TEST", "2026-03-01");
      // Not duplicates: empty and missing emails, and the same mailbox of another account.
      await insertRecipient(previous, owner, "", "2026-01-02");
      await insertRecipient(previous, owner, "", "2026-01-03");
      await insertRecipient(previous, owner, null, "2026-01-04");
      await insertRecipient(previous, neighbour, "a@x.test", "2026-01-05");
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

    it("is the only pending migration and keeps the email of the newest duplicate", async () => {
      const applied = await current.runMigrations({ transaction: "all" });
      expect(applied.map((migration) => migration.name)).toEqual([
        EMAIL_MIGRATION,
      ]);

      expect(await emails(owner)).toEqual([
        null, // a@x.test, 2026-01-01
        "", // 2026-01-02
        "",
        null, // never had one
        null, // A@X.test, 2026-02-01
        "a@x.TEST",
      ]);
      expect(await emails(neighbour)).toEqual(["a@x.test"]);
      expect(
        await current.query(`SELECT count(*)::int AS rows FROM recipients`),
      ).toEqual([{ rows: 7 }]);
    });

    it("refuses a case-insensitive duplicate under the index the service maps to 409", async () => {
      const error = await insertRecipient(
        current,
        owner,
        "A@x.Test",
        "2026-04-01",
      ).catch((caught: unknown) => caught);

      expect(isUniqueViolationOf(error, RECIPIENT_EMAIL_UNIQUE_INDEX)).toBe(
        true,
      );
      // Empty emails stay outside the index.
      await expect(
        insertRecipient(current, owner, "", "2026-04-02"),
      ).resolves.toHaveLength(1);
    });

    it("reverts and applies again", async () => {
      await current.undoLastMigration({ transaction: "all" });
      const indexes = async () =>
        (
          await current.query(
            `SELECT indexname FROM pg_indexes WHERE indexname = $1`,
            [RECIPIENT_EMAIL_UNIQUE_INDEX],
          )
        ).length;
      expect(await indexes()).toBe(0);
      await insertRecipient(current, owner, "A@x.Test", "2026-05-01");

      await current.runMigrations({ transaction: "all" });

      expect(await indexes()).toBe(1);
      expect((await emails(owner)).filter((email) => email)).toEqual([
        "A@x.Test",
      ]);
    });
  },
);
