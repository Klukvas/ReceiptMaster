import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBrandedProformaSettings1762300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "primaryColor" VARCHAR(7) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "paymentTerms" VARCHAR(500) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "deliveryTerms" VARCHAR(500) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "deliveryTerms"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "paymentTerms"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "primaryColor"`,
    );
  }
}
