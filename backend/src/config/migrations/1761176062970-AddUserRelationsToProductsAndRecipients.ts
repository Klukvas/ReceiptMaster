import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserRelationsToProductsAndRecipients1761176062970
  implements MigrationInterface
{
  name = "AddUserRelationsToProductsAndRecipients1761176062970";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_recipient_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_receipts_order_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_recipient_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_created_at"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receipts_order_id_unique"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_receipts_number_unique"`);
    // Добавляем колонки user_id как nullable сначала
    await queryRunner.query(`ALTER TABLE "recipients" ADD "user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "products" ADD "user_id" uuid`);

    // Получаем первого пользователя для заполнения существующих записей
    const users = await queryRunner.query(`SELECT id FROM "users" LIMIT 1`);
    if (users.length > 0) {
      const defaultUserId = users[0].id;
      // Заполняем существующие записи первым пользователем
      await queryRunner.query(
        `UPDATE "recipients" SET "user_id" = $1 WHERE "user_id" IS NULL`,
        [defaultUserId],
      );
      await queryRunner.query(
        `UPDATE "products" SET "user_id" = $1 WHERE "user_id" IS NULL`,
        [defaultUserId],
      );
    }

    // Теперь делаем колонки NOT NULL
    await queryRunner.query(
      `ALTER TABLE "recipients" ALTER COLUMN "user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "user_id" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('draft', 'confirmed', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "status" "public"."orders_status_enum" NOT NULL DEFAULT 'draft'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "purchase_price_cents" DROP DEFAULT`,
    );
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "currency"`);
    await queryRunner.query(
      `CREATE TYPE "public"."products_currency_enum" AS ENUM('UAH')`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "currency" "public"."products_currency_enum" NOT NULL DEFAULT 'UAH'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "updatedAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "UQ_9545ae8fc5f7714cd8a807dd937" UNIQUE ("order_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "UQ_c4c2c9f6e041e6680df88dd121e" UNIQUE ("number")`,
    );
    await queryRunner.query(`ALTER TABLE "receipts" DROP COLUMN "status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."receipts_status_enum" AS ENUM('generated', 'void')`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD "status" "public"."receipts_status_enum" NOT NULL DEFAULT 'generated'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c884e321f927d5b86aac7c8f9e" ON "orders" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5ac3048b290562976746002e49" ON "orders" ("recipient_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c4c2c9f6e041e6680df88dd121" ON "receipts" ("number") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9545ae8fc5f7714cd8a807dd93" ON "receipts" ("order_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "recipients" ADD CONSTRAINT "FK_6157e8b6ba4e6e3089616481fe2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_5ac3048b290562976746002e49f" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_176b502c5ebd6e72cafbd9d6f70" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_9545ae8fc5f7714cd8a807dd937" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_9545ae8fc5f7714cd8a807dd937"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_176b502c5ebd6e72cafbd9d6f70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_5ac3048b290562976746002e49f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipients" DROP CONSTRAINT "FK_6157e8b6ba4e6e3089616481fe2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9545ae8fc5f7714cd8a807dd93"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c4c2c9f6e041e6680df88dd121"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5ac3048b290562976746002e49"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c884e321f927d5b86aac7c8f9e"`,
    );
    await queryRunner.query(`ALTER TABLE "receipts" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."receipts_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD "status" character varying(20) NOT NULL DEFAULT 'generated'`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "UQ_c4c2c9f6e041e6680df88dd121e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "UQ_9545ae8fc5f7714cd8a807dd937"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "currency"`);
    await queryRunner.query(`DROP TYPE "public"."products_currency_enum"`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD "currency" character varying(3) NOT NULL DEFAULT 'UAH'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "purchase_price_cents" SET DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "status" character varying(20) NOT NULL DEFAULT 'draft'`,
    );
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "user_id"`);
    await queryRunner.query(`ALTER TABLE "recipients" DROP COLUMN "user_id"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_number_unique" ON "receipts" ("number") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_order_id_unique" ON "receipts" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_created_at" ON "orders" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_recipient_id" ON "orders" ("recipient_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_receipts_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_recipient_id" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
