import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceiptHtmlTemplateVoid1761500000002
  implements MigrationInterface
{
  name = "AddReceiptHtmlTemplateVoid1761500000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "receipts" ADD COLUMN "html_snapshot" TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE "receipts" ADD COLUMN "template_id" VARCHAR(50)
    `);

    await queryRunner.query(`
      ALTER TABLE "receipts" ADD COLUMN "template_version" INTEGER DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "receipts" ADD COLUMN "voided_at" TIMESTAMP DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "receipts" ADD COLUMN "void_reason" VARCHAR(500) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "void_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "voided_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "template_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "template_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN "html_snapshot"`,
    );
  }
}
