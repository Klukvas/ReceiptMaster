import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPerformanceIndexes1762000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Order: deleted_at (soft-delete filter used in dashboard, subscription)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_deleted_at" ON "orders" ("deleted_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_user_id_deleted_at" ON "orders" ("user_id", "deleted_at")`,
    );

    // Supplier: user_id (all queries filter by user_id, no index exists)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_suppliers_user_id" ON "suppliers" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_suppliers_user_id_name" ON "suppliers" ("user_id", "name")`,
    );

    // Product: quantity (used by getLowStockProducts)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_user_id_quantity" ON "products" ("user_id", "quantity")`,
    );

    // Receipt: status (used by cleanupOldReceipts)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_receipts_user_id_status" ON "receipts" ("user_id", "status")`,
    );

    // RefreshToken: composite for auth queries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_token_revoked" ON "refresh_tokens" ("token", "revoked")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at")`,
    );

    // IdempotencyKey: expires_at (used by cleanup service)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_idempotency_keys_expires_at" ON "idempotency_keys" ("expires_at")`,
    );

    // pg_trgm extension + GIN indexes for ILIKE searches
    // CREATE EXTENSION requires superuser; skip GIN indexes if extension unavailable
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_products_name_trgm" ON "products" USING gin("name" gin_trgm_ops)`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_recipients_name_trgm" ON "recipients" USING gin("name" gin_trgm_ops)`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_suppliers_name_trgm" ON "suppliers" USING gin("name" gin_trgm_ops)`,
      );
    } catch {
      // pg_trgm not available — GIN indexes skipped, ILIKE still works (sequential scan)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recipients_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_name_trgm"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_idempotency_keys_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_token_revoked"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_receipts_user_id_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_products_user_id_quantity"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_suppliers_user_id_name"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_user_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_orders_user_id_deleted_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_deleted_at"`);
  }
}
