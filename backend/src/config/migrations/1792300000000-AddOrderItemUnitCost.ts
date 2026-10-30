import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Purchase-cost snapshot per order line, captured when a draft line is written
 * and immutable once the order is confirmed. Additive and nullable on purpose:
 * existing lines stay NULL ("cost unknown") — no backfill from the current
 * product price, which would rewrite historical profit with today's cost.
 *
 * The inline CHECK makes PostgreSQL scan order_items once under the ACCESS
 * EXCLUSIVE lock that ADD COLUMN already holds (no rewrite: the column is NULL
 * with no default). NOT VALID + VALIDATE would not shorten that lock here because
 * the release script runs every pending migration in one transaction.
 */
export class AddOrderItemUnitCost1792300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "unit_cost_cents" integer NULL CONSTRAINT "CHK_order_items_unit_cost_non_negative" CHECK ("unit_cost_cents" IS NULL OR "unit_cost_cents" >= 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "unit_cost_cents"`,
    );
  }
}
