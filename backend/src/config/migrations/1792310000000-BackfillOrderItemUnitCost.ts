import { Logger } from "@nestjs/common";
import { MigrationInterface, QueryRunner } from "typeorm";

const FILTERED_BY_ROW_SECURITY =
  "BackfillOrderItemUnitCost must run as a role that row security does not filter";

/**
 * The only guard against a silent zero-row UPDATE: row security would narrow the
 * writes below and any count that checks them alike (with no tenant set, every
 * row is hidden), so it is refused up front. It is inactive for a superuser and
 * for the owner of a table that does not FORCE row security, which is how the
 * chain leaves these two tables.
 */
async function assertRowSecurityInactive(
  queryRunner: QueryRunner,
): Promise<void> {
  const [{ filtered }] = await queryRunner.query(
    `SELECT row_security_active('"order_items"') OR row_security_active('"products"') AS filtered`,
  );
  if (filtered) throw new Error(FILTERED_BY_ROW_SECURITY);
}

/**
 * The owner's knowing decision, replacing the "legacy cost stays unknown" rule
 * of AddOrderItemUnitCost: lines without a snapshot take the product's current
 * purchase price so existing users get their analytics back. That price is only
 * an estimate of the historical cost, not the truth. Lines that already hold a
 * real snapshot are never touched, and new lines keep capturing real snapshots.
 *
 * `unit_cost_estimated` records which lines were estimated here, which keeps the
 * provenance and makes `down` exact. Raw SQL on purpose: it has to reach lines on
 * soft-deleted products, and it covers every order status and soft-deleted
 * orders. For a draft the value equals what a draft edit would capture. A
 * negative product cost cannot be a cost, so such a line stays unknown. So does a
 * line whose product belongs to another tenant: that price says nothing about
 * this tenant's cost, and failing the release over it would leave every tenant
 * without analytics, so those lines are only counted in a warning.
 *
 * A draft line edited after this runs is written again with the flag at its
 * default: an unchanged line keeps the estimated cost with the flag false, so
 * `down` leaves that one cost in place.
 */
export class BackfillOrderItemUnitCost1792310000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await assertRowSecurityInactive(queryRunner);
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "unit_cost_estimated" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "order_items" oi
       SET "unit_cost_cents" = p."purchase_price_cents", "unit_cost_estimated" = true
       FROM "products" p
       WHERE oi."product_id" = p."id"
         AND oi."user_id" = p."user_id"
         AND oi."unit_cost_cents" IS NULL
         AND p."purchase_price_cents" >= 0`,
    );
    // Wider than the UPDATE on purpose: after it, this is exactly the lines whose
    // product belongs to another tenant. Count only, never ids or tenant data. Not
    // the connection's logger: TypeORM logging is off in production.
    const [{ crossTenantLines }] = await queryRunner.query(
      `SELECT count(*)::int AS "crossTenantLines"
       FROM "order_items" oi
       INNER JOIN "products" p ON p."id" = oi."product_id"
       WHERE oi."unit_cost_cents" IS NULL
         AND p."purchase_price_cents" >= 0`,
    );
    if (crossTenantLines > 0) {
      new Logger("BackfillOrderItemUnitCost").warn(
        `${crossTenantLines} line(s) point at another tenant's product and stay unknown`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await assertRowSecurityInactive(queryRunner);
    await queryRunner.query(
      `UPDATE "order_items" SET "unit_cost_cents" = NULL WHERE "unit_cost_estimated"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "unit_cost_estimated"`,
    );
  }
}
