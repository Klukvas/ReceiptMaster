import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductSoftDelete1762500000000 implements MigrationInterface {
  name = "AddProductSoftDelete1762500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "deleted_at" TIMESTAMP DEFAULT NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_products_not_deleted" ON "products" ("deleted_at") WHERE "deleted_at" IS NULL`,
    );

    // Заменяем обычный индекс на partial unique — чтобы можно было
    // создать новый товар с тем же именем после удаления старого
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_user_name"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_products_user_name"
      ON "products" ("user_id", "name")
      WHERE "deleted_at" IS NULL
    `);

    // Меняем FK order_items → products с CASCADE на RESTRICT,
    // чтобы hard delete продукта не уничтожал order_items и статистику
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_9263386c35b6b242540f9493b00"`,
    );

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Восстанавливаем FK CASCADE
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_9263386c35b6b242540f9493b00"`,
    );

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_user_name"`);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_user_name"
      ON "products" ("user_id", "name")
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_not_deleted"`);

    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "deleted_at"`);
  }
}
