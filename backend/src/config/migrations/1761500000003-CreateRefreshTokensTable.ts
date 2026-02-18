import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRefreshTokensTable1761500000003
  implements MigrationInterface
{
  name = "CreateRefreshTokensTable1761500000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" VARCHAR(500) NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_token" ON "refresh_tokens" ("token")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_user" ON "refresh_tokens" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
