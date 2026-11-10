import { MigrationInterface, QueryRunner } from "typeorm";

const YEAR_TABLE = "document_year_counters";
const START_CHECK = "CHK_document_counters_start_number";
const RESET_CHECK = "CHK_document_counters_reset_needs_year";

/**
 * Optional yearly numbering reset. `document_counters` gets the switch (`reset_every_year`,
 * off) and the number a new year starts at (`start_number`, 1). While the switch is off
 * nothing reads the new table and the existing counter behaves exactly as before, so
 * every existing account keeps its numbers.
 *
 * `document_year_counters` holds one counter per (account, type, year), created lazily by
 * the first draw of a year. No backfill is needed and none assumes clean data: the first
 * draw of a year starts above the highest number of that year already issued (read from
 * `receipts`), so numbers issued before the switch was turned on, by an older image or by
 * hand, are never repeated.
 *
 * The reset requires the year in the number: the unique index on `receipts` has no year
 * column, so "000001" of two years would collide. The CHECK states that rule.
 *
 * `down` first raises each flat counter (and the legacy waybill counter) to the highest
 * yearly value, so an older image that counts on the flat counter does not hand out a
 * number a reset-mode year already used.
 */
export class DocumentCounterYear1793700000000 implements MigrationInterface {
  name = "DocumentCounterYear1793700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_counters"
         ADD COLUMN "reset_every_year" boolean NOT NULL DEFAULT false,
         ADD COLUMN "start_number" integer NOT NULL DEFAULT 1,
         ADD CONSTRAINT "${START_CHECK}" CHECK ("start_number" BETWEEN 1 AND 2000000000),
         ADD CONSTRAINT "${RESET_CHECK}" CHECK (NOT "reset_every_year" OR "include_year")`,
    );
    await queryRunner.query(`
      CREATE TABLE "${YEAR_TABLE}" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "document_type" "receipts_document_type_enum" NOT NULL,
        "year" integer NOT NULL CHECK ("year" BETWEEN 1000 AND 9999),
        "value" integer NOT NULL DEFAULT 0 CHECK ("value" >= 0),
        PRIMARY KEY ("user_id", "document_type", "year")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "${YEAR_TABLE}" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "${YEAR_TABLE}" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation ON "${YEAR_TABLE}"
         USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
         WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Both tables force row security, which hides every row from the owner role; the
    // temporary policies are dropped before the transaction ends.
    const policies = [
      `CREATE POLICY year_counter_down_select ON "${YEAR_TABLE}" FOR SELECT TO CURRENT_USER USING (true)`,
      `CREATE POLICY counter_down_select ON "document_counters" FOR SELECT TO CURRENT_USER USING (true)`,
      `CREATE POLICY counter_down_update ON "document_counters" FOR UPDATE TO CURRENT_USER USING (true) WITH CHECK (true)`,
    ];
    for (const policy of policies) await queryRunner.query(policy);
    await queryRunner.query(`
      UPDATE "document_counters" AS c
      SET "value" = GREATEST(c."value", y."highest")
      FROM (
        SELECT "user_id", "document_type", MAX("value") AS "highest"
        FROM "${YEAR_TABLE}" GROUP BY "user_id", "document_type"
      ) AS y
      WHERE c."user_id" = y."user_id" AND c."document_type" = y."document_type"
    `);
    await queryRunner.query(`
      UPDATE "users" AS u
      SET "receipt_counter" = GREATEST(u."receipt_counter", y."highest")
      FROM (
        SELECT "user_id", MAX("value") AS "highest"
        FROM "${YEAR_TABLE}" WHERE "document_type" = 'waybill' GROUP BY "user_id"
      ) AS y
      WHERE u."id" = y."user_id"
    `);
    await queryRunner.query(
      `DROP POLICY counter_down_update ON "document_counters"`,
    );
    await queryRunner.query(
      `DROP POLICY counter_down_select ON "document_counters"`,
    );
    await queryRunner.query(
      `DROP POLICY year_counter_down_select ON "${YEAR_TABLE}"`,
    );
    await queryRunner.query(`DROP TABLE "${YEAR_TABLE}"`);
    await queryRunner.query(
      `ALTER TABLE "document_counters"
         DROP CONSTRAINT "${RESET_CHECK}",
         DROP CONSTRAINT "${START_CHECK}",
         DROP COLUMN "start_number",
         DROP COLUMN "reset_every_year"`,
    );
  }
}
