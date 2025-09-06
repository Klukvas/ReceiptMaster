import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateProductsTable1700000000002 implements MigrationInterface {
  name = "UpdateProductsTable1700000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_sku_unique"`);

    // Drop old columns
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "sku"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "vat_rate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "is_active"`,
    );

    // Rename old price column
    await queryRunner.query(
      `ALTER TABLE "products" RENAME COLUMN "price_cents" TO "sale_price_cents"`,
    );

    // Add new purchase price column
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "purchase_price_cents" integer NOT NULL DEFAULT 0`,
    );

    // Update currency column to support UAH (already supports any 3 characters)

    // Update existing records - set purchase price equal to sale price
    await queryRunner.query(
      `UPDATE "products" SET "purchase_price_cents" = "sale_price_cents"`,
    );

    // Drop vat_cents column from orders as VAT is no longer used
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "vat_cents"`,
    );

    // Drop sku and vat_rate columns from order_items
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "sku"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "vat_rate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "line_vat_cents"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore columns in order_items
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "sku" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "vat_rate" numeric(5,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "line_vat_cents" integer NOT NULL DEFAULT 0`,
    );

    // Restore vat_cents column in orders
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "vat_cents" integer NOT NULL DEFAULT 0`,
    );

    // Restore old columns in products
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "sku" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "vat_rate" numeric(5,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true`,
    );

    // Rename column back
    await queryRunner.query(
      `ALTER TABLE "products" RENAME COLUMN "sale_price_cents" TO "price_cents"`,
    );

    // Drop new purchase price column
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "purchase_price_cents"`,
    );

    // Restore default currency to RUB
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'RUB'`,
    );

    // Create old indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_products_sku" ON "products" ("sku")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_is_active" ON "products" ("is_active")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_products_sku_unique" ON "products" ("sku") WHERE "sku" IS NOT NULL`,
    );
  }
}
