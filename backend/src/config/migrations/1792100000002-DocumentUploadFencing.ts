import { MigrationInterface, QueryRunner } from "typeorm";

/** Unapplied: durable uncertain PUT tombstones and collector/settlement CAS fencing. */
export class DocumentUploadFencing1792100000002 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    if (!q.isTransactionActive)
      throw new Error("Document storage migration requires a transaction");
    for (const table of ["document_assets", "document_artifacts"]) {
      // Old uploading/deleting intents may still have an uncertain remote PUT.
      await q.query(`ALTER TABLE ${table} ADD COLUMN upload_pending boolean NOT NULL DEFAULT true,
        ADD COLUMN cleanup_token uuid NOT NULL DEFAULT gen_random_uuid(),
        ADD COLUMN cleanup_attempts integer NOT NULL DEFAULT 0 CHECK(cleanup_attempts BETWEEN 0 AND 10)`);
      await q.query(
        `CREATE POLICY upload_fencing_backfill_select ON ${table} FOR SELECT TO CURRENT_USER USING (true)`,
      );
      await q.query(
        `CREATE POLICY upload_fencing_backfill_update ON ${table} FOR UPDATE TO CURRENT_USER USING (true) WITH CHECK (true)`,
      );
      await q.query(
        `UPDATE ${table} SET upload_pending=false WHERE state='ready'`,
      );
      await q.query(`DROP POLICY upload_fencing_backfill_update ON ${table}`);
      await q.query(`DROP POLICY upload_fencing_backfill_select ON ${table}`);
      await q.query(
        `ALTER TABLE ${table} ALTER COLUMN upload_pending SET DEFAULT false`,
      );
    }
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of ["document_assets", "document_artifacts"])
      await q.query(
        `ALTER TABLE ${table} DROP COLUMN cleanup_attempts, DROP COLUMN cleanup_token, DROP COLUMN upload_pending`,
      );
  }
}
