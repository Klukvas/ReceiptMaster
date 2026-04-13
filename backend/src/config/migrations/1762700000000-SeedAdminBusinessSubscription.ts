import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedAdminBusinessSubscription1762700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const email = "admin@example.com";

    const users: Array<{ id: string }> = await queryRunner.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );

    if (!users || users.length === 0) {
      throw new Error(
        "SeedAdminBusinessSubscription: admin user not found. Ensure SeedDefaultAdmin ran first.",
      );
    }

    const userId = users[0].id;

    const existing: Array<{ id: string }> = await queryRunner.query(
      "SELECT id FROM user_subscriptions WHERE user_id = $1",
      [userId],
    );

    if (existing && existing.length > 0) {
      await queryRunner.query(
        "UPDATE user_subscriptions SET plan = $1, updated_at = NOW() WHERE user_id = $2",
        ["business", userId],
      );
    } else {
      await queryRunner.query(
        "INSERT INTO user_subscriptions (id, user_id, plan, created_at, updated_at) VALUES (uuid_generate_v4(), $1, $2, NOW(), NOW())",
        [userId, "business"],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const users: Array<{ id: string }> = await queryRunner.query(
      "SELECT id FROM users WHERE email = $1",
      ["admin@example.com"],
    );

    if (!users || users.length === 0) {
      return;
    }

    await queryRunner.query(
      "DELETE FROM user_subscriptions WHERE user_id = $1 AND plan = $2",
      [users[0].id, "business"],
    );
  }
}
