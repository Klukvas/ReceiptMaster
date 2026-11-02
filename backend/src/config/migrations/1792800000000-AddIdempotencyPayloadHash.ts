import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stores a SHA-256 fingerprint of the request body next to each idempotency
 * key, so reusing a key with a different body is refused instead of silently
 * replaying the first response. Additive and nullable: rows written before this
 * release (and order keys, which carry no fingerprint) stay NULL and keep
 * replaying as before. No index or constraint changes; rows expire within 24 h.
 */
export class AddIdempotencyPayloadHash1792800000000
  implements MigrationInterface
{
  name = "AddIdempotencyPayloadHash1792800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ADD COLUMN "payload_hash" varchar(64) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" DROP COLUMN "payload_hash"`,
    );
  }
}
