import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateIdempotencyKeysTable1761400000000
  implements MigrationInterface
{
  name = "CreateIdempotencyKeysTable1761400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key" varchar(255) NOT NULL,
        "user_id" uuid NOT NULL,
        "order_id" uuid,
        "response" jsonb,
        "status_code" integer NOT NULL DEFAULT 200,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_idempotency_keys" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_idempotency_keys_key_user_id"
      ON "idempotency_keys" ("key", "user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_idempotency_keys_expires_at"
      ON "idempotency_keys" ("expires_at")
    `);

    // Add foreign key to users table
    await queryRunner.query(`
      ALTER TABLE "idempotency_keys"
      ADD CONSTRAINT "FK_idempotency_keys_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Add foreign key to orders table (nullable)
    await queryRunner.query(`
      ALTER TABLE "idempotency_keys"
      ADD CONSTRAINT "FK_idempotency_keys_order_id"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "idempotency_keys" DROP CONSTRAINT "FK_idempotency_keys_order_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "idempotency_keys" DROP CONSTRAINT "FK_idempotency_keys_user_id"
    `);
    await queryRunner.query(`DROP INDEX "IDX_idempotency_keys_expires_at"`);
    await queryRunner.query(`DROP INDEX "IDX_idempotency_keys_key_user_id"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
  }
}
