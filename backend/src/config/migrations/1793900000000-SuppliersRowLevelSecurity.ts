import { MigrationInterface, QueryRunner } from "typeorm";

const POLICY = "tenant_isolation_suppliers";
const TENANT = "NULLIF(current_setting('app.current_user_id', true), '')::uuid";
const FILTERED_BY_ROW_SECURITY =
  "SuppliersRowLevelSecurity: row security filters products or suppliers for this role, so " +
  "cross-tenant links could hide from the data fix; run as a role that sees every row.";

/**
 * `suppliers` joins the other tenant tables under row-level security, so the runtime role
 * (rm_app) only ever sees the current tenant's suppliers. Until now `ProductsService` alone
 * kept a product from linking another tenant's supplier; that check stays.
 *
 * Never assume clean data: before the policy, a product linked to a supplier of another
 * account (possible before the service check) is unlinked (`supplier_id = NULL`), since that
 * supplier would vanish from its owner's view anyway. Issued documents are unaffected.
 *
 * ENABLE only, not FORCE, as for the original tenant tables: the owner role that runs
 * migrations and backfills still sees every row. rm_app already has table grants
 * (db/roles/03-grants.sql). `supplier_products` has no `user_id` and no runtime reader, so it
 * stays as it is.
 *
 * `down` drops the policy and disables row security; unlinked products are not relinked.
 */
export class SuppliersRowLevelSecurity1793900000000
  implements MigrationInterface
{
  name = "SuppliersRowLevelSecurity1793900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ filtered }] = await queryRunner.query(
      `SELECT row_security_active('"products"') OR row_security_active('"suppliers"') AS filtered`,
    );
    if (filtered) throw new Error(FILTERED_BY_ROW_SECURITY);

    await queryRunner.query(`
      UPDATE "products" p SET "supplier_id" = NULL
        FROM "suppliers" s
       WHERE p."supplier_id" = s."id" AND p."user_id" <> s."user_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY ${POLICY} ON "suppliers"
        USING ("user_id" = ${TENANT})
        WITH CHECK ("user_id" = ${TENANT})
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS ${POLICY} ON "suppliers"`);
    await queryRunner.query(
      `ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY`,
    );
  }
}
