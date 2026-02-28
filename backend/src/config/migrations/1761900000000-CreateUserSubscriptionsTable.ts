import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserSubscriptionsTable1761900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "plan" varchar(20) NOT NULL DEFAULT 'free',
        "paddle_customer_id" varchar(255),
        "paddle_subscription_id" varchar(255),
        "paddle_status" varchar(50),
        "current_period_end" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_subscriptions_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_user_subscriptions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_subscriptions_user_id" ON "user_subscriptions" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_subscriptions_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_subscriptions"`);
  }
}
