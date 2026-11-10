import { MigrationInterface, QueryRunner } from "typeorm";

const INDEX = "IDX_recipients_user_email_unique";
const FILTERED_BY_ROW_SECURITY =
  "RecipientEmailUnique: row security filters recipients for this role, so duplicates " +
  "could hide from the dedup step; run as a role that sees every row.";

/**
 * One email per recipient within an account (case-insensitive), enforced by a partial
 * unique index. The service already checked this before writing, but a racing create,
 * or the idempotent create path that skipped the check, could store a duplicate.
 *
 * Never assume clean data: before the index, every group of the same account's
 * recipients sharing `lower(email)` keeps the email only on the newest row (by
 * `created_at`, then `id`); the others get `email = NULL`. The recipient rows, their
 * orders and documents stay; issued documents froze their buyer when issued. Production
 * holds no recipient emails at the time of writing, so this is expected to touch nothing.
 *
 * `down` drops the index. Emails nulled by the dedup are not restored (the duplicates
 * were not recorded anywhere else).
 */
export class RecipientEmailUnique1793800000000 implements MigrationInterface {
  name = "RecipientEmailUnique1793800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"recipients"') AS filtered`,
    );
    if (filtered) throw new Error(FILTERED_BY_ROW_SECURITY);

    await queryRunner.query(`
      UPDATE "recipients" AS r
      SET "email" = NULL
      FROM (
        SELECT "id", ROW_NUMBER() OVER (
          PARTITION BY "user_id", lower("email")
          ORDER BY "created_at" DESC, "id" DESC
        ) AS "position"
        FROM "recipients"
        WHERE "email" IS NOT NULL AND "email" <> ''
      ) AS ranked
      WHERE r."id" = ranked."id" AND ranked."position" > 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${INDEX}" ON "recipients" ("user_id", lower("email"))
      WHERE "email" IS NOT NULL AND "email" <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${INDEX}"`);
  }
}
