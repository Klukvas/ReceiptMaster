import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds a `failed` value to the receipt status enum so a receipt whose PDF
 * generation exhausts its retries stops living forever in `processing`.
 * Postgres 12+ allows ADD VALUE inside a transaction as long as the new value
 * isn't used in the same transaction — which it isn't here.
 */
export class AddFailedReceiptStatus1762900000000 implements MigrationInterface {
  name = "AddFailedReceiptStatus1762900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "receipts_status_enum" ADD VALUE IF NOT EXISTS 'failed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres can't drop a single enum value, so rebuild the type without it.
    // Any receipt still marked 'failed' is folded into 'void' (its closest
    // "not a usable receipt" meaning) before the value disappears.
    await queryRunner.query(
      `ALTER TABLE "receipts" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "receipts_status_enum" RENAME TO "receipts_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "receipts_status_enum" AS ENUM('processing', 'generated', 'void')`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ALTER COLUMN "status" TYPE "receipts_status_enum" USING (
         CASE WHEN "status"::text = 'failed' THEN 'void' ELSE "status"::text END::"receipts_status_enum"
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ALTER COLUMN "status" SET DEFAULT 'generated'`,
    );
    await queryRunner.query(`DROP TYPE "receipts_status_enum_old"`);
  }
}
