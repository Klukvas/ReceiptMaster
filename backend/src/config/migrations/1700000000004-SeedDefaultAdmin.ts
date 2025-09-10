import { MigrationInterface, QueryRunner } from "typeorm";
import * as bcrypt from "bcrypt";

export class SeedDefaultAdmin1700000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const email = "admin@example.com";
    const password = "password123";

    const existing: Array<{ id: string }> = await queryRunner.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );

    if (existing && existing.length > 0) {
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await queryRunner.query(
      'INSERT INTO users (id, email, password, "firstName", "lastName", "isActive", "createdAt", "updatedAt") VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW(), NOW())',
      [email, hashedPassword, "Admin", "User", true],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM users WHERE email = $1", [
      "admin@example.com",
    ]);
  }
}
