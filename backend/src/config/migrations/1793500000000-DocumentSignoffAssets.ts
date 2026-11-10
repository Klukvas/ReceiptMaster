import { MigrationInterface, QueryRunner } from "typeorm";

const KIND_CHECK = "CHK_document_assets_kind";
const SIZE_CHECKS = [
  ["width", "document_assets_width_check"],
  ["height", "document_assets_height_check"],
] as const;
const NARROW_SIZE = 600;
// A signature is stored up to 800 px wide (a logo never exceeds 600).
const WIDE_SIZE = 800;

/**
 * The account-level signature and stamp images ride on the logo machinery: the same
 * `document_assets` table (leases, sha256, row-level security, scheduled cleanup) with a
 * `kind`, plus two nullable pointers on `user_settings`.
 *
 * Additive and nullable throughout: existing rows become kind 'logo', and the old
 * application image neither reads nor writes any of it. Rolling the IMAGE back (without
 * this down) is not harmless: the old cleanup does not know the new pointers and deletes the
 * objects of active signatures about 24 hours later, so they must be uploaded again. The logo owner trigger now also
 * requires kind 'logo', so a signature asset cannot be used as a logo even by a bug.
 */
export class DocumentSignoffAssets1793500000000 implements MigrationInterface {
  name = "DocumentSignoffAssets1793500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_assets"
         ADD COLUMN "kind" varchar(16) NOT NULL DEFAULT 'logo',
         ADD CONSTRAINT "${KIND_CHECK}" CHECK ("kind" IN ('logo', 'signature', 'stamp'))`,
    );
    for (const [column, name] of SIZE_CHECKS) {
      await queryRunner.query(
        `ALTER TABLE "document_assets" DROP CONSTRAINT "${name}",
           ADD CONSTRAINT "${name}" CHECK ("${column}" BETWEEN 1 AND ${WIDE_SIZE})`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "user_settings"
         ADD COLUMN "signature_asset_id" uuid REFERENCES "document_assets"("id"),
         ADD COLUMN "stamp_asset_id" uuid REFERENCES "document_assets"("id")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION document_settings_signoff_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.signature_asset_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM document_assets
          WHERE id = NEW.signature_asset_id AND user_id::text = NEW."userId" AND kind = 'signature'
        ) THEN RAISE EXCEPTION 'Invalid signature owner'; END IF;
        IF NEW.stamp_asset_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM document_assets
          WHERE id = NEW.stamp_asset_id AND user_id::text = NEW."userId" AND kind = 'stamp'
        ) THEN RAISE EXCEPTION 'Invalid stamp owner'; END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(
      `CREATE TRIGGER document_settings_signoff_owner
         BEFORE INSERT OR UPDATE OF signature_asset_id, stamp_asset_id, "userId"
         ON user_settings FOR EACH ROW EXECUTE FUNCTION document_settings_signoff_owner()`,
    );
    await queryRunner.query(logoOwnerFunction("AND kind = 'logo'"));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER document_settings_signoff_owner ON user_settings`,
    );
    await queryRunner.query(`DROP FUNCTION document_settings_signoff_owner()`);
    await queryRunner.query(logoOwnerFunction(""));
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "signature_asset_id", DROP COLUMN "stamp_asset_id"`,
    );
    // WARNING: only the rows go. Their objects under signoffs/ in the private logos bucket
    // stay behind as orphans (SQL cannot reach storage); remove them with a lifecycle rule
    // or by hand. Signature and stamp rows would break the narrower size checks. The table is under
    // FORCE row security, which the owner role is subject to, so it is lifted for the delete.
    await queryRunner.query(
      `ALTER TABLE "document_assets" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DELETE FROM "document_assets" WHERE "kind" <> 'logo'`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_assets" FORCE ROW LEVEL SECURITY`,
    );
    for (const [column, name] of SIZE_CHECKS) {
      await queryRunner.query(
        `ALTER TABLE "document_assets" DROP CONSTRAINT "${name}",
           ADD CONSTRAINT "${name}" CHECK ("${column}" BETWEEN 1 AND ${NARROW_SIZE})`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "document_assets" DROP CONSTRAINT "${KIND_CHECK}", DROP COLUMN "kind"`,
    );
  }
}

/** The logo owner trigger function from DocumentConfiguration, optionally kind-aware. */
function logoOwnerFunction(extraCondition: string): string {
  return `CREATE OR REPLACE FUNCTION document_settings_logo_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.logo_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM document_assets WHERE id=NEW.logo_asset_id AND user_id::text=NEW."userId" ${extraCondition}) THEN RAISE EXCEPTION 'Invalid logo owner'; END IF;
      RETURN NEW; END $$`;
}
