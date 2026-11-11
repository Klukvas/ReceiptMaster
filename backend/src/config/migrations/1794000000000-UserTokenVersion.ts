import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Makes access tokens revocable. Every access token carries the `tv` claim, the
 * account's `token_version` when it was signed; the JWT strategy and the receipts
 * WebSocket gateway refuse a token whose claim differs from the stored value. Logout
 * and a password change add 1, which kills every access token issued before.
 *
 * Additive: a constant default adds the column without rewriting the table. Tokens
 * signed before this release have no claim and count as version 0, so they stay valid
 * until they expire. The old application image never reads or writes the column, so
 * rolling the image back needs no schema change.
 *
 * `down` drops the column. Access tokens revoked by a bump become valid again until
 * they expire (24 h at most); refresh tokens revoked with them stay revoked.
 */
export class UserTokenVersion1794000000000 implements MigrationInterface {
  name = "UserTokenVersion1794000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "token_version"`,
    );
  }
}
