import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPublicTokenToReceipts1762100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD COLUMN "public_token" VARCHAR(64) UNIQUE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_receipts_public_token" ON "receipts" ("public_token")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_receipts_public_token"`);
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN IF EXISTS "public_token"`,
    );
  }
}
