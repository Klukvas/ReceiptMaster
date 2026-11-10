import { MigrationInterface, QueryRunner } from "typeorm";

const INDEX = "IDX_receipts_order_document_type";
// Only these types may be issued again after a void; a voided waybill, sales receipt or
// packing list keeps its slot, so the database enforces what the service already refuses.
const REISSUABLE_TYPES = `'invoice', 'act'`;

/**
 * A voided invoice or act frees its slot on the order, so the order can carry a fresh one
 * under a new number while the voided row stays as history. The one-document-per-type
 * index therefore stops counting voided invoices and acts; every other type keeps its slot.
 *
 * Loosening a unique index cannot fail on existing data. The old index is dropped and the
 * new one created in the same transaction, so no write can slip through between them.
 */
export class ReissueVoidedDocuments1793100000000 implements MigrationInterface {
  name = "ReissueVoidedDocuments1793100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${INDEX}"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "${INDEX}" ON "receipts" ("order_id", "document_type") WHERE "document_type" <> 'return_note' AND ("status" <> 'void' OR "document_type" NOT IN (${REISSUABLE_TYPES}))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Row-level security would hide rows from the duplicate check below.
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"receipts"') AS filtered`,
    );
    if (filtered) {
      throw new Error(
        "ReissueVoidedDocuments must run as a role that row security does not filter",
      );
    }
    // Voided history is never deleted: going back is only possible while no order holds
    // a reissued document next to its voided predecessor.
    const duplicates = await queryRunner.query(
      `SELECT "order_id", "document_type" FROM "receipts"
       WHERE "document_type" <> 'return_note'
       GROUP BY "order_id", "document_type" HAVING COUNT(*) > 1 LIMIT 5`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Cannot revert: orders with a reissued document block this migration: ${duplicates
          .map(
            (row: { order_id: string; document_type: string }) =>
              `${row.order_id} (${row.document_type})`,
          )
          .join(", ")}`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "${INDEX}"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "${INDEX}" ON "receipts" ("order_id", "document_type") WHERE "document_type" <> 'return_note'`,
    );
  }
}
