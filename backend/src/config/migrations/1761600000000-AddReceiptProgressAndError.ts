import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceiptProgressAndError1761600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD COLUMN "progress" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD COLUMN "error_message" varchar(1000) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "error_message"`,
    );
    await queryRunner.query(`ALTER TABLE "receipts" DROP COLUMN "progress"`);
  }
}
