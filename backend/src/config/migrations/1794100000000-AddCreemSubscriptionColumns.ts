import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The payment provider changed from Paddle to Creem. The release process keeps a migration
 * when it rolls the application back, so this one only adds: the previous images still find
 * their `paddle_*` columns. Those were never filled in production (billing was never
 * enabled) and can be dropped in a later release, once no deployed image reads them.
 *
 * `creem_event_at` records when the provider created the last applied webhook event, so a
 * delayed retry cannot overwrite newer state.
 */
export class AddCreemSubscriptionColumns1794100000000
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_subscriptions_creem_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_subscriptions_creem_sub_id"`,
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
