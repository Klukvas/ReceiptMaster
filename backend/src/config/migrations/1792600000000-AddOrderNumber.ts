import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Orders get a short number per account (1, 2, 3, ...) so people can say "order 17"
 * instead of reading out the tail of a UUID.
 *
 * Existing orders are numbered in creation order per account, soft-deleted ones
 * included, so no number is ever reused. The column is added empty, filled, checked,
 * and only then made NOT NULL and unique: a unique index on data that was never
 * numbered would fail on real rows that a clean test database does not have.
 */
export class AddOrderNumber1792600000000 implements MigrationInterface {
  name = "AddOrderNumber1792600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Row-level security would make the UPDATE below silently skip rows.
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"orders"') AS filtered`,
    );
    if (filtered) {
      throw new Error(
        "AddOrderNumber must run as a role that row security does not filter",
      );
    }

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "order_number" integer`,
    );
    await queryRunner.query(`
      UPDATE "orders" AS o
      SET "order_number" = numbered.n
      FROM (
        SELECT "id", ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id")::int AS n
        FROM "orders"
      ) AS numbered
      WHERE o."id" = numbered."id"
    `);

    const [{ unnumbered }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS unnumbered FROM "orders" WHERE "order_number" IS NULL`,
    );
    if (unnumbered > 0) {
      throw new Error(`${unnumbered} order(s) were not numbered`);
    }

    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "order_number" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_orders_user_order_number" ON "orders" ("user_id", "order_number")`,
    );

    // Safety net for any writer that does not pick a number itself (seed scripts, manual
    // inserts): the database numbers the row, under the same per-account lock the API's
    // nextOrderNumber() takes, so the two can never hand out the same number.
    await queryRunner.query(`
      CREATE FUNCTION "assign_order_number"() RETURNS trigger AS $$
      BEGIN
        IF NEW."order_number" IS NULL THEN
          PERFORM pg_advisory_xact_lock(hashtext('order-number'), hashtext(NEW."user_id"::text));
          SELECT COALESCE(MAX("order_number"), 0) + 1 INTO NEW."order_number"
          FROM "orders" WHERE "user_id" = NEW."user_id";
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_orders_assign_order_number"
      BEFORE INSERT ON "orders"
      FOR EACH ROW EXECUTE FUNCTION "assign_order_number"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_orders_assign_order_number" ON "orders"`,
    );
    await queryRunner.query(`DROP FUNCTION "assign_order_number"()`);
    await queryRunner.query(`DROP INDEX "IDX_orders_user_order_number"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "order_number"`);
  }
}
