import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Receipt numbers were drawn from one global sequence, so every customer could read the
 * whole service's volume off their own receipts. Numbers are now counted per account.
 *
 * Existing receipts keep their numbers (they are printed on issued PDFs and in public
 * links). Each account's counter starts at the highest number it already holds, so new
 * receipts continue above its own history. Uniqueness narrows from (number) to
 * (user_id, number): nothing looks a receipt up by number alone, and the old index was
 * strictly stronger, so the new one cannot fail on existing data. The old global
 * function and sequence stay in place, unused.
 */
export class PerAccountReceiptNumbers1792700000000
  implements MigrationInterface
{
  name = "PerAccountReceiptNumbers1792700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Row-level security would make the backfill below silently skip rows.
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"receipts"') AS filtered`,
    );
    if (filtered) {
      throw new Error(
        "PerAccountReceiptNumbers must run as a role that row security does not filter",
      );
    }

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "receipt_counter" integer NOT NULL DEFAULT 0`,
    );
    // Numbers look like "2026-000036"; anything else (hand-edited rows) is ignored here
    // and cannot collide with a generated one.
    await queryRunner.query(`
      UPDATE "users" AS u
      SET "receipt_counter" = highest.n
      FROM (
        SELECT "user_id", MAX(split_part("number", '-', 2)::int) AS n
        FROM "receipts"
        WHERE "number" ~ '^[0-9]{4}-[0-9]{1,9}$'
        GROUP BY "user_id"
      ) AS highest
      WHERE u."id" = highest."user_id"
    `);

    // The global uniqueness lives under different names depending on how the schema
    // was built (index from CreateTables, or index plus constraint generated from the
    // entity), so find it by shape rather than by name.
    await queryRunner.query(`
      DO $$
      DECLARE item record;
      BEGIN
        FOR item IN
          SELECT i.indexrelid::regclass::text AS index_name, c.conname
          FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
          LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid AND c.contype = 'u'
          WHERE i.indrelid = 'receipts'::regclass
            AND i.indisunique AND i.indnatts = 1 AND a.attname = 'number'
        LOOP
          IF item.conname IS NOT NULL THEN
            EXECUTE format('ALTER TABLE "receipts" DROP CONSTRAINT %I', item.conname);
          ELSE
            EXECUTE format('DROP INDEX %s', item.index_name);
          END IF;
        END LOOP;
      END
      $$
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_user_number" ON "receipts" ("user_id", "number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Per-account numbers repeat across accounts, so the global index can only come
    // back once the repeats are gone: renumber later duplicates from the old sequence.
    await queryRunner.query(`DROP INDEX "IDX_receipts_user_number"`);
    await queryRunner.query(`
      UPDATE "receipts" AS r
      SET "number" = generate_receipt_number()
      FROM (
        SELECT "id", ROW_NUMBER() OVER (PARTITION BY "number" ORDER BY "created_at", "id") AS rn
        FROM "receipts"
      ) AS ranked
      WHERE r."id" = ranked."id" AND ranked.rn > 1
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_number_unique" ON "receipts" ("number")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "receipt_counter"`,
    );
  }
}
