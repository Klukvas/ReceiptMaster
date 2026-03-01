import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaddleIndexes1762200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_paddle_sub_id" ON "user_subscriptions" ("paddle_subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_paddle_status" ON "user_subscriptions" ("paddle_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_subscriptions_paddle_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_subscriptions_paddle_sub_id"`,
    );
  }
}
