import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeReceiptTitleNullable1762800000000
  implements MigrationInterface
{
  name = "MakeReceiptTitleNullable1762800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ALTER COLUMN "receiptTitle" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ALTER COLUMN "receiptTitle" DROP DEFAULT`,
    );
    await queryRunner.query(
      `UPDATE "user_settings" SET "receiptTitle" = NULL WHERE "receiptTitle" = 'Invoice'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "user_settings" SET "receiptTitle" = 'Invoice' WHERE "receiptTitle" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ALTER COLUMN "receiptTitle" SET DEFAULT 'Invoice'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ALTER COLUMN "receiptTitle" SET NOT NULL`,
    );
  }
}
