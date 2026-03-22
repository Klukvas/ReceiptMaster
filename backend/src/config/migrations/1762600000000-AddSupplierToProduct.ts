import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupplierToProduct1762600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "supplier_id" uuid DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_supplier"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_supplier_id" ON "products" ("supplier_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_products_supplier"`);
    await queryRunner.query(`DROP INDEX "IDX_products_supplier_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "supplier_id"`);
  }
}
