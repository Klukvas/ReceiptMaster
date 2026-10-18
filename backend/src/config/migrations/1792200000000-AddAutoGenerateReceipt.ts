import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutoGenerateReceipt1792200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN "autoGenerateReceipt" BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "autoGenerateReceipt"`,
    );
  }
}
