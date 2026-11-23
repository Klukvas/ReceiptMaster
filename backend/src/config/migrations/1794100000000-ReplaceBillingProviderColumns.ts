import { MigrationInterface, QueryRunner } from "typeorm";

const PREVIOUS_PROVIDER = "paddle";

/**
 * Moves `user_subscriptions` to the Creem billing columns and drops the previous provider's.
 * Those were never filled in production: billing was never enabled there.
 *
 * NOT additive. The images released before this migration select the dropped columns on
 * every subscription read, so rolling the application back also needs this migration
 * reverted (`down` re-creates the columns, empty).
 *
 * `creem_event_at` records when the provider created the last applied webhook event, so a
 * delayed retry cannot overwrite newer state.
 */
export class ReplaceBillingProviderColumns1794100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_subscriptions"
         ADD COLUMN IF NOT EXISTS "creem_customer_id" varchar(255),
         ADD COLUMN IF NOT EXISTS "creem_subscription_id" varchar(255),
         ADD COLUMN IF NOT EXISTS "creem_status" varchar(50),
         ADD COLUMN IF NOT EXISTS "creem_event_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_creem_sub_id" ON "user_subscriptions" ("creem_subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_creem_status" ON "user_subscriptions" ("creem_status")`,
    );
    // Dropping a column drops the indexes built on it.
    await queryRunner.query(
      `ALTER TABLE "user_subscriptions"
         DROP COLUMN IF EXISTS "${PREVIOUS_PROVIDER}_customer_id",
         DROP COLUMN IF EXISTS "${PREVIOUS_PROVIDER}_subscription_id",
         DROP COLUMN IF EXISTS "${PREVIOUS_PROVIDER}_status"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_subscriptions"
         ADD COLUMN IF NOT EXISTS "${PREVIOUS_PROVIDER}_customer_id" varchar(255),
         ADD COLUMN IF NOT EXISTS "${PREVIOUS_PROVIDER}_subscription_id" varchar(255),
         ADD COLUMN IF NOT EXISTS "${PREVIOUS_PROVIDER}_status" varchar(50)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_${PREVIOUS_PROVIDER}_sub_id" ON "user_subscriptions" ("${PREVIOUS_PROVIDER}_subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_${PREVIOUS_PROVIDER}_status" ON "user_subscriptions" ("${PREVIOUS_PROVIDER}_status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_subscriptions"
         DROP COLUMN IF EXISTS "creem_event_at",
         DROP COLUMN IF EXISTS "creem_status",
         DROP COLUMN IF EXISTS "creem_subscription_id",
         DROP COLUMN IF EXISTS "creem_customer_id"`,
    );
  }
}
