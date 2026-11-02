import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Receipt numbers were counted once per account (`users.receipt_counter`). With several
 * document types each type now counts on its own, so an invoice and a waybill may both be
 * "2026-000001". Uniqueness widens from (user_id, number) to (user_id, document_type,
 * number) accordingly.
 *
 * Existing numbers are untouched: they are printed on issued PDFs. Each account's waybill
 * counter starts at the higher of its old counter and the highest number it holds, so new
 * waybills continue above its own history. `users.receipt_counter` stays: the application
 * keeps it in step for one release (safe image rollback) and `down()` writes back to it.
 */
export class DocumentCounters1792900000000 implements MigrationInterface {
  name = "DocumentCounters1792900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Row-level security would hide receipts from the backfill below.
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"receipts"') AS filtered`,
    );
    if (filtered) {
      throw new Error(
        "DocumentCounters must run as a role that row security does not filter",
      );
    }

    await queryRunner.query(`
      CREATE TABLE "document_counters" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "document_type" "receipts_document_type_enum" NOT NULL,
        "value" integer NOT NULL DEFAULT 0 CHECK ("value" >= 0),
        PRIMARY KEY ("user_id", "document_type")
      )
    `);

    // Before row security is switched on: the owner role has no BYPASSRLS, so afterwards
    // this insert would fail its WITH CHECK. Numbers look like "2026-000036"; anything
    // else (hand-edited rows) is ignored and cannot collide with a generated one.
    await queryRunner.query(`
      INSERT INTO "document_counters" ("user_id", "document_type", "value")
      SELECT "user_id", "document_type", MAX("n")
      FROM (
        SELECT "id" AS "user_id", 'waybill'::"receipts_document_type_enum" AS "document_type",
               "receipt_counter" AS "n"
        FROM "users" WHERE "receipt_counter" > 0
        UNION ALL
        SELECT "user_id", "document_type", split_part("number", '-', 2)::int
        FROM "receipts" WHERE "number" ~ '^[0-9]{4}-[0-9]{1,9}$'
      ) AS candidates
      GROUP BY "user_id", "document_type"
    `);

    await queryRunner.query(
      `ALTER TABLE "document_counters" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_counters" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation ON "document_counters"
         USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
         WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)`,
    );

    // The new index goes in first so uniqueness never lapses.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_user_type_number" ON "receipts" ("user_id", "document_type", "number")`,
    );
    await queryRunner.query(`DROP INDEX "IDX_receipts_user_number"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Different types may share a number, so the narrower index only comes back while
    // every document is still a waybill (the same condition AddReceiptDocumentType uses).
    const [{ blocking }] = await queryRunner.query(`
      SELECT COUNT(*)::int AS blocking FROM "receipts" WHERE "document_type" <> 'waybill'
    `);
    if (blocking > 0) {
      throw new Error(
        `Cannot revert: ${blocking} receipt(s) of a type other than waybill exist; remove them first`,
      );
    }

    // The owner role cannot read a FORCE RLS table; the table is dropped right after.
    await queryRunner.query(
      `ALTER TABLE "document_counters" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      UPDATE "users" AS u
      SET "receipt_counter" = GREATEST(u."receipt_counter", c."value")
      FROM "document_counters" AS c
      WHERE c."user_id" = u."id" AND c."document_type" = 'waybill'
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_user_number" ON "receipts" ("user_id", "number")`,
    );
    await queryRunner.query(`DROP INDEX "IDX_receipts_user_type_number"`);
    await queryRunner.query(`DROP TABLE "document_counters"`);
  }
}
