import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Plans now limit how many generated documents of each type an account keeps. An invoice,
 * act or return note over the limit keeps its row (its number and order slot must not be
 * reused) and loses only its file; this column records when. Additive: images released
 * before it never read the column.
 */
export class AddReceiptContentPurgedAt1794200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "content_purged_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP COLUMN IF EXISTS "content_purged_at"`,
    );
  }
}
