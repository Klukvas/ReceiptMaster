import { MigrationInterface, QueryRunner } from "typeorm";

export class DocumentStorageLeases1792100000001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    if (!q.isTransactionActive)
      throw new Error("Document storage migration requires a transaction");
    await q.query(`CREATE TABLE document_artifacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      object_key varchar NOT NULL UNIQUE CHECK(object_key LIKE 'receipts/'||user_id::text||'/%'),
      state varchar NOT NULL CHECK(state IN ('uploading','ready','deleting')),
      lease_expires_at timestamptz NOT NULL)`);
    await q.query(
      `CREATE INDEX document_artifacts_cleanup ON document_artifacts(user_id,lease_expires_at)`,
    );
    await q.query(
      `CREATE INDEX document_assets_cleanup ON document_assets(user_id,lease_expires_at)`,
    );
    await q.query(`ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE document_artifacts FORCE ROW LEVEL SECURITY`);
    await q.query(`CREATE POLICY tenant_isolation ON document_artifacts USING
      (user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid) WITH CHECK
      (user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid)`);
    // Identifier-only operational scheduling, intentionally outside tenant RLS like the outbox.
    await q.query(
      `CREATE TABLE document_storage_sweeps(user_id uuid PRIMARY KEY,next_sweep_at timestamptz NOT NULL)`,
    );
    await q.query(
      `CREATE INDEX document_storage_sweeps_due ON document_storage_sweeps(next_sweep_at,user_id)`,
    );
    // Owner-only, SELECT-only policy exists solely inside this migration transaction.
    // FORCE RLS otherwise hides inactive tenants from an ordinary migration owner.
    await q.query(
      `CREATE POLICY document_assets_backfill ON document_assets FOR SELECT TO CURRENT_USER USING (true)`,
    );
    await q.query(`INSERT INTO document_storage_sweeps(user_id,next_sweep_at)
      SELECT DISTINCT user_id,now()+interval '24 hours' FROM document_assets ON CONFLICT DO NOTHING`);
    await q.query(`DROP POLICY document_assets_backfill ON document_assets`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE document_storage_sweeps`);
    await q.query(`DROP TABLE document_artifacts`);
    await q.query(`DROP INDEX document_assets_cleanup`);
  }
}
