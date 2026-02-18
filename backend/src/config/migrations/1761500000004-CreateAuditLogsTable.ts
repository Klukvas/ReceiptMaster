import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditLogsTable1761500000004 implements MigrationInterface {
  name = "CreateAuditLogsTable1761500000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "action" VARCHAR(50) NOT NULL,
        "entity_type" VARCHAR(50) NOT NULL,
        "entity_id" VARCHAR(255),
        "old_values" JSONB,
        "new_values" JSONB,
        "ip_address" VARCHAR(45),
        "user_agent" VARCHAR(500),
        "request_id" VARCHAR(36),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_user_id" ON "audit_logs" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
