import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceiptProcessingStatus1761500000005
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'processing' value to the existing receipt status enum
    await queryRunner.query(
      `ALTER TYPE "receipts_status_enum" ADD VALUE IF NOT EXISTS 'processing'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values directly.
    // Recreate the type without 'processing'.
    // First update any rows that still have 'processing' to 'generated'
    await queryRunner.query(
      `UPDATE "receipts" SET "status" = 'generated' WHERE "status" = 'processing'`,
    );

    // Rename old enum, create new, swap columns, drop old
    await queryRunner.query(
      `ALTER TYPE "receipts_status_enum" RENAME TO "receipts_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "receipts_status_enum" AS ENUM('generated', 'void')`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ALTER COLUMN "status" TYPE "receipts_status_enum" USING "status"::text::"receipts_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "receipts_status_enum_old"`);
  }
}
