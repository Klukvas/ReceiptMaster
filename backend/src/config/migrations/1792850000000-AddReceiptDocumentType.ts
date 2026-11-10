import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Receipts become one of several document types. Until now an order carried at most one
 * receipt (unique `order_id`); it may now carry one document per type, and any number of
 * return notes (partial returns).
 *
 * Every existing row is a видаткова накладна, so the column defaults to `waybill` and needs
 * no backfill. The new unique index is created before the old uniqueness goes, so there is
 * never a moment without one. `order_id` was already unique, so it cannot fail on
 * existing data.
 */
export class AddReceiptDocumentType1792850000000 implements MigrationInterface {
  name = "AddReceiptDocumentType1792850000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Row-level security would hide rows from the duplicate check below.
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"receipts"') AS filtered`,
    );
    if (filtered) {
      throw new Error(
        "AddReceiptDocumentType must run as a role that row security does not filter",
      );
    }
    const duplicates = await queryRunner.query(
      `SELECT "order_id" FROM "receipts" GROUP BY "order_id" HAVING COUNT(*) > 1 LIMIT 5`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Orders with more than one receipt block this migration: ${duplicates
          .map((row: { order_id: string }) => row.order_id)
          .join(", ")}`,
      );
    }

    await queryRunner.query(
      `CREATE TYPE "receipts_document_type_enum" AS ENUM ('waybill', 'invoice', 'quote', 'act', 'sales_receipt', 'packing_list', 'return_note')`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD COLUMN "document_type" "receipts_document_type_enum" NOT NULL DEFAULT 'waybill'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_order_document_type" ON "receipts" ("order_id", "document_type") WHERE "document_type" <> 'return_note'`,
    );

    // The partial index above cannot serve lookups by order alone (order.receipts joins,
    // voiding on cancel, file cleanup) nor return notes, so keep a plain one.
    await queryRunner.query(
      `CREATE INDEX "IDX_receipts_order_id" ON "receipts" ("order_id")`,
    );

    // The old uniqueness lives under different names depending on how the schema was
    // built (an index from CreateTables, or an index plus constraint generated from the
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
            AND i.indisunique AND i.indnatts = 1 AND i.indpred IS NULL
            AND a.attname = 'order_id'
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Going back is only lossless while every order still has its single waybill.
    const [{ blocking }] = await queryRunner.query(`
      SELECT COUNT(*)::int AS blocking FROM "receipts"
      WHERE "document_type" <> 'waybill'
    `);
    if (blocking > 0) {
      throw new Error(
        `Cannot revert: ${blocking} receipt(s) of a type other than waybill exist; remove them first`,
      );
    }

    await queryRunner.query(`DROP INDEX "IDX_receipts_order_id"`);
    await queryRunner.query(`DROP INDEX "IDX_receipts_order_document_type"`);
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "UQ_9545ae8fc5f7714cd8a807dd937" UNIQUE ("order_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "document_type"`,
    );
    await queryRunner.query(`DROP TYPE "receipts_document_type_enum"`);
  }
}
