import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompositeIndexes1761500000000 implements MigrationInterface {
  name = "AddCompositeIndexes1761500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_user_status"
      ON "orders" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_user_created"
      ON "orders" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_user_name"
      ON "products" ("user_id", "name")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_recipients_user_phone"
      ON "recipients" ("user_id", "phone")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_receipts_user_created"
      ON "receipts" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_order_items_order"
      ON "order_items" ("order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_order_items_product"
      ON "order_items" ("product_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_order_items_product"`);
    await queryRunner.query(`DROP INDEX "IDX_order_items_order"`);
    await queryRunner.query(`DROP INDEX "IDX_receipts_user_created"`);
    await queryRunner.query(`DROP INDEX "IDX_recipients_user_phone"`);
    await queryRunner.query(`DROP INDEX "IDX_products_user_name"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_user_created"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_user_status"`);
  }
}
