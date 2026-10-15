import { MigrationInterface, QueryRunner } from "typeorm";
export class DocumentConfiguration1792100000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE document_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, object_key varchar NOT NULL UNIQUE,
      sha256 varchar(64) NOT NULL, mime varchar NOT NULL DEFAULT 'image/png', bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 524288),
      width integer NOT NULL CHECK(width BETWEEN 1 AND 600), height integer NOT NULL CHECK(height BETWEEN 1 AND 600),
      state varchar NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','ready','deleting')), lease_expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id))`);
    await q.query(
      `ALTER TABLE user_settings ADD COLUMN document_config jsonb, ADD COLUMN document_config_revision integer NOT NULL DEFAULT 0, ADD COLUMN logo_asset_id uuid REFERENCES document_assets(id)`,
    );
    await q.query(`CREATE TABLE document_presets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      name varchar(80) NOT NULL CHECK(length(trim(name)) > 0), config jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
      logo_asset_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,name), FOREIGN KEY(logo_asset_id,user_id) REFERENCES document_assets(id,user_id))`);
    await q.query(`ALTER TABLE receipts ADD COLUMN active_revision integer NOT NULL DEFAULT 0, ADD COLUMN active_snapshot jsonb,
      ADD COLUMN pending_snapshot jsonb, ADD COLUMN pending_html text, ADD COLUMN pending_id uuid,
      ADD COLUMN pending_expected_revision integer, ADD COLUMN replacement_status varchar(20), ADD COLUMN replacement_error varchar(500),
      ADD COLUMN active_logo_asset_id uuid, ADD COLUMN pending_logo_asset_id uuid,
      ADD CONSTRAINT receipts_active_logo_fk FOREIGN KEY(active_logo_asset_id,user_id) REFERENCES document_assets(id,user_id),
      ADD CONSTRAINT receipts_pending_logo_fk FOREIGN KEY(pending_logo_asset_id,user_id) REFERENCES document_assets(id,user_id)`);
    for (const table of ["document_assets", "document_presets"]) {
      await q.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await q.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await q.query(
        `CREATE POLICY tenant_isolation ON ${table} USING (user_id = NULLIF(current_setting('app.current_user_id', true),'')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true),'')::uuid)`,
      );
    }
    // user_settings uses a legacy varchar tenant key; constrain the new pointer without changing unrelated RLS.
    await q.query(`CREATE FUNCTION document_settings_logo_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.logo_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM document_assets WHERE id=NEW.logo_asset_id AND user_id::text=NEW."userId") THEN RAISE EXCEPTION 'Invalid logo owner'; END IF;
      RETURN NEW; END $$`);
    await q.query(
      `CREATE TRIGGER document_settings_logo_owner BEFORE INSERT OR UPDATE OF logo_asset_id, "userId" ON user_settings FOR EACH ROW EXECUTE FUNCTION document_settings_logo_owner()`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER document_settings_logo_owner ON user_settings`);
    await q.query(`DROP FUNCTION document_settings_logo_owner()`);
    await q.query(
      `ALTER TABLE receipts DROP COLUMN active_revision, DROP COLUMN active_snapshot, DROP COLUMN pending_snapshot, DROP COLUMN pending_html, DROP COLUMN pending_id, DROP COLUMN pending_expected_revision, DROP COLUMN replacement_status, DROP COLUMN replacement_error, DROP COLUMN active_logo_asset_id, DROP COLUMN pending_logo_asset_id`,
    );
    await q.query(`DROP TABLE document_presets`);
    await q.query(
      `ALTER TABLE user_settings DROP COLUMN document_config, DROP COLUMN document_config_revision, DROP COLUMN logo_asset_id`,
    );
    await q.query(`DROP TABLE document_assets`);
  }
}
