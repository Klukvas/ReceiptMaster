import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTables1700000000000 implements MigrationInterface {
  name = "CreateTables1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Создание таблицы products
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "sku" character varying(100),
        "price_cents" integer NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'RUB',
        "vat_rate" numeric(5,4),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id")
      )
    `);

    // Создание индексов для products
    await queryRunner.query(
      `CREATE INDEX "IDX_products_sku" ON "products" ("sku")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_is_active" ON "products" ("is_active")`,
    );

    // Создание уникального индекса для SKU
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_products_sku_unique" ON "products" ("sku") WHERE "sku" IS NOT NULL`,
    );

    // Создание таблицы recipients
    await queryRunner.query(`
      CREATE TABLE "recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "email" character varying(255),
        "phone" character varying(50),
        "address" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recipients_id" PRIMARY KEY ("id")
      )
    `);

    // Создание таблицы orders
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "recipient_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "subtotal_cents" integer NOT NULL,
        "vat_cents" integer NOT NULL,
        "total_cents" integer NOT NULL,
        "currency" character varying(3) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id")
      )
    `);

    // Создание индексов для orders
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_recipient_id" ON "orders" ("recipient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_created_at" ON "orders" ("created_at")`,
    );

    // Создание внешнего ключа для orders
    await queryRunner.query(`
      ALTER TABLE "orders" 
      ADD CONSTRAINT "FK_orders_recipient_id" 
      FOREIGN KEY ("recipient_id") 
      REFERENCES "recipients"("id") 
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Создание таблицы order_items
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "product_name" character varying(255) NOT NULL,
        "sku" character varying(100),
        "unit_price_cents" integer NOT NULL,
        "qty" integer NOT NULL,
        "vat_rate" numeric(5,4),
        "line_total_cents" integer NOT NULL,
        "line_vat_cents" integer NOT NULL,
        CONSTRAINT "PK_order_items_id" PRIMARY KEY ("id")
      )
    `);

    // Создание внешних ключей для order_items
    await queryRunner.query(`
      ALTER TABLE "order_items" 
      ADD CONSTRAINT "FK_order_items_order_id" 
      FOREIGN KEY ("order_id") 
      REFERENCES "orders"("id") 
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items" 
      ADD CONSTRAINT "FK_order_items_product_id" 
      FOREIGN KEY ("product_id") 
      REFERENCES "products"("id") 
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Создание таблицы receipts
    await queryRunner.query(`
      CREATE TABLE "receipts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "number" character varying(50) NOT NULL,
        "pdf_url" character varying(500),
        "pdf_path" character varying(500),
        "hash" character varying(64),
        "status" character varying(20) NOT NULL DEFAULT 'generated',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_receipts_id" PRIMARY KEY ("id")
      )
    `);

    // Создание уникальных индексов для receipts
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_order_id_unique" ON "receipts" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_number_unique" ON "receipts" ("number")`,
    );

    // Создание внешнего ключа для receipts
    await queryRunner.query(`
      ALTER TABLE "receipts" 
      ADD CONSTRAINT "FK_receipts_order_id" 
      FOREIGN KEY ("order_id") 
      REFERENCES "orders"("id") 
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Создание sequence для номеров чеков
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1`,
    );

    // Создание функции для генерации номера чека
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION generate_receipt_number()
      RETURNS TEXT AS $$
      DECLARE
          year_part TEXT;
          seq_part TEXT;
      BEGIN
          year_part := EXTRACT(YEAR FROM NOW())::TEXT;
          seq_part := LPAD(nextval('receipt_number_seq')::TEXT, 6, '0');
          RETURN year_part || '-' || seq_part;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Удаление функции
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS generate_receipt_number()`,
    );

    // Удаление sequence
    await queryRunner.query(`DROP SEQUENCE IF EXISTS receipt_number_seq`);

    // Удаление таблиц в обратном порядке
    await queryRunner.query(`DROP TABLE IF EXISTS "receipts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
  }
}
