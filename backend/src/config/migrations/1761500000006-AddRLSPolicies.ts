import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Enable Row-Level Security on all tenant-scoped tables.
 *
 * Policies use `current_setting('app.current_user_id', true)` so that:
 *  - When the setting IS set → rows are filtered to that user.
 *  - When the setting is NOT set → the cast to uuid fails gracefully
 *    (missing_ok = true returns empty string, which won't match any uuid).
 *
 * NOTE: RLS is NOT forced on the table owner.  As long as the app
 * connects as the table owner the policies are transparent.  To
 * fully activate isolation, create a restricted app role and
 * connect with that role instead.
 */
export class AddRLSPolicies1761500000006 implements MigrationInterface {
  name = "AddRLSPolicies1761500000006";

  private readonly tables = [
    "orders",
    "products",
    "recipients",
    "order_items",
    "receipts",
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );

      await queryRunner.query(`
        CREATE POLICY tenant_isolation_${table} ON "${table}"
          USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...this.tables].reverse()) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_${table} ON "${table}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
    }
  }
}
