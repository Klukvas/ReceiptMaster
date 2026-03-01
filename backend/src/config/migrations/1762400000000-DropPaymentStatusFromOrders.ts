import { MigrationInterface, QueryRunner } from "typeorm";

export class DropPaymentStatusFromOrders1762400000000
  implements MigrationInterface
{
  name = "DropPaymentStatusFromOrders1762400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_status"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "payment_status_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM ('unpaid', 'paid', 'refunded')
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "payment_status" "payment_status_enum" NOT NULL DEFAULT 'unpaid'
    `);
  }
}
