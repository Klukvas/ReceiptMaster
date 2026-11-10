import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `document_artifacts.created_at`, so a tombstone of a failed PDF upload can be dropped once
 * its late-write window has passed (see `LATE_WRITE_WINDOW_MS`); `document_assets` has had
 * the column from the start. Existing rows get the migration time, which only postpones
 * their cleanup.
 *
 * Additive: a stable default adds the column without rewriting the table, and the old
 * application image neither reads nor writes it.
 */
export class DocumentArtifactCreatedAt1793600000000
  implements MigrationInterface
{
  name = "DocumentArtifactCreatedAt1793600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_artifacts" ADD COLUMN "created_at" timestamptz NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_artifacts" DROP COLUMN IF EXISTS "created_at"`,
    );
  }
}
