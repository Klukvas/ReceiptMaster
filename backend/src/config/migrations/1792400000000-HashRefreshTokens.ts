import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Refresh tokens are looked up by their SHA-256 from now on; new rows store no
 * plaintext. Existing rows get the hash but keep their plaintext: a failed
 * release rolls back to the previous image with this migration retained, and
 * that image still redeems by plaintext. Those rows expire within 30 days, after
 * which the `token` column can be dropped by a later release.
 *
 * `family_id` groups a login's rotation chain so a replayed ancestor revokes
 * it; every existing row starts its own family. `redeemed_at` is set only by a
 * rotation, so a lost race between tabs can be told apart from a replay, and a
 * token revoked by logout or a password change is neither. It is timestamptz
 * because the grace check compares it with the process clock.
 */
export class HashRefreshTokens1792400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens"
         ADD COLUMN "token_hash" varchar(64) NULL,
         ADD COLUMN "family_id" uuid NULL,
         ADD COLUMN "redeemed_at" TIMESTAMPTZ NULL,
         ALTER COLUMN "token" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens"
       SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex'),
           "family_id" = "id"`,
    );
    // `token` was never unique. Keep the newest row of each duplicate and make
    // the others unreachable (no hash, no plaintext) so the unique index builds.
    await queryRunner.query(
      `UPDATE "refresh_tokens" AS stale
       SET "token_hash" = NULL, "token" = NULL, "revoked" = true
       FROM "refresh_tokens" AS newer
       WHERE newer."token_hash" = stale."token_hash"
         AND (newer."created_at", newer."id") > (stale."created_at", stale."id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_family_live" ON "refresh_tokens" ("family_id") WHERE "revoked" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_family_live"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_refresh_tokens_token_hash"`,
    );
    // Hash-only rows cannot satisfy NOT NULL, and the previous code could not
    // redeem them anyway: their sessions end with the revert.
    await queryRunner.query(
      `DELETE FROM "refresh_tokens" WHERE "token" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens"
         ALTER COLUMN "token" SET NOT NULL,
         DROP COLUMN IF EXISTS "redeemed_at",
         DROP COLUMN IF EXISTS "family_id",
         DROP COLUMN IF EXISTS "token_hash"`,
    );
  }
}
