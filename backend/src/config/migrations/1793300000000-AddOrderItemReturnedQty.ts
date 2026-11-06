import { MigrationInterface, QueryRunner } from "typeorm";

const CONSTRAINT = "CHK_order_items_returned_qty_range";

/**
 * Durable ledger of goods taken back: how much of each order line is covered by issued
 * return notes. The note rows may be evicted by retention, so the quantity limit cannot be
 * derived from them; it lives on the line itself, guarded by a CHECK.
 *
 * Additive: a constant default adds the column without rewriting the table, and the
 * inline CHECK holds for every existing row (0 <= qty). The old application image never
 * reads or writes the column, so rolling the image back needs no schema change.
 */
export class AddOrderItemReturnedQty1793300000000
  implements MigrationInterface
{
  name = "AddOrderItemReturnedQty1793300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "returned_qty" integer NOT NULL DEFAULT 0 CONSTRAINT "${CONSTRAINT}" CHECK ("returned_qty" >= 0 AND "returned_qty" <= "qty")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Row-level security would hide lines from the check below.
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"order_items"') AS filtered`,
    );
    if (filtered) {
      throw new Error(
        "AddOrderItemReturnedQty must run as a role that row security does not filter",
      );
    }
    // Dropping the column would forget returns that issued return notes still describe,
    // and the same goods could then be returned again.
    const returned = await queryRunner.query(
      `SELECT "id", "order_id" FROM "order_items" WHERE "returned_qty" > 0 LIMIT 5`,
    );
    if (returned.length > 0) {
      throw new Error(
        `Cannot revert: order lines with returned goods block this migration: ${returned
          .map(
            (row: { id: string; order_id: string }) =>
              `${row.id} (order ${row.order_id})`,
          )
          .join(", ")}`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "returned_qty"`,
    );
  }
}
