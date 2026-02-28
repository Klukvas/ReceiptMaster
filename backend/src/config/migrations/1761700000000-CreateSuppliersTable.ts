import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSuppliersTable1761700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "email" varchar(255),
        "phone" varchar(50),
        "address" text,
        "contact_person" varchar(255),
        "notes" text,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_suppliers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_suppliers_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_suppliers_user_id" ON "suppliers" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_suppliers_user_id_name" ON "suppliers" ("user_id", "name")
    `);

    await queryRunner.query(`
      CREATE TABLE "supplier_products" (
        "supplier_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        CONSTRAINT "PK_supplier_products" PRIMARY KEY ("supplier_id", "product_id"),
        CONSTRAINT "FK_supplier_products_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_supplier_products_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_supplier_products_supplier_id" ON "supplier_products" ("supplier_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_supplier_products_product_id" ON "supplier_products" ("product_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_supplier_products_product_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_supplier_products_supplier_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_products"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_suppliers_user_id_name"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
  }
}
