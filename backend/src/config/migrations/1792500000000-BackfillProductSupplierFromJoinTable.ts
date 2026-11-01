import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Products now have exactly one supplier: `products.supplier_id`. The older
 * many-to-many `supplier_products` table was a second, independent link that the
 * UI never kept in sync with it.
 *
 * Existing links are copied into `supplier_id` (only where it is still empty, so a
 * supplier chosen on the product itself always wins). A product linked to several
 * suppliers gets the oldest one, ties broken by id. `supplier_products` is kept as
 * a read-only archive and dropped by a later migration once this one is live.
 */
export class BackfillProductSupplierFromJoinTable1792500000000
  implements MigrationInterface
{
  name = "BackfillProductSupplierFromJoinTable1792500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" AS p
      SET "supplier_id" = chosen.supplier_id
      FROM (
        SELECT DISTINCT ON (sp.product_id) sp.product_id, sp.supplier_id
        FROM "supplier_products" sp
        JOIN "suppliers" s ON s.id = sp.supplier_id
        JOIN "products" pr ON pr.id = sp.product_id AND pr.user_id = s.user_id
        ORDER BY sp.product_id, s.created_at ASC, s.id ASC
      ) AS chosen
      WHERE p.id = chosen.product_id
        AND p."supplier_id" IS NULL
    `);

    // Row-level security can make an UPDATE silently match nothing; refuse to continue
    // rather than leave links behind that nothing reads any more.
    const [{ unmigrated }] = await queryRunner.query(`
      SELECT COUNT(DISTINCT sp.product_id)::int AS unmigrated
      FROM "supplier_products" sp
      JOIN "suppliers" s ON s.id = sp.supplier_id
      JOIN "products" pr ON pr.id = sp.product_id AND pr.user_id = s.user_id
      WHERE pr."supplier_id" IS NULL
    `);

    if (unmigrated > 0) {
      throw new Error(
        `${unmigrated} supplier-product link(s) were not copied to products.supplier_id; ` +
          "check that the migration role bypasses row-level security on products",
      );
    }
  }

  public async down(): Promise<void> {
    // Intentionally empty: supplier_products was left untouched, so the previous
    // links are still there and nothing needs to be restored.
  }
}
