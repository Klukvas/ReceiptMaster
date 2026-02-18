import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderSoftDeletePaymentLock1761500000001
  implements MigrationInterface
{
  name = "AddOrderSoftDeletePaymentLock1761500000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM ('unpaid', 'paid', 'refunded')
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "payment_status" "payment_status_enum" NOT NULL DEFAULT 'unpaid'
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "deleted_at" TIMESTAMP DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "is_locked" BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_not_deleted"
      ON "orders" ("deleted_at") WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_not_deleted"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "is_locked"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "payment_status"`);
    await queryRunner.query(`DROP TYPE "payment_status_enum"`);
  }
}
