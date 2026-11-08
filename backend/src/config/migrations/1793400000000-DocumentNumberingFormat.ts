import { MigrationInterface, QueryRunner } from "typeorm";

const PADDING_CHECK = "CHK_document_counters_padding";
const PREFIX_CHECK = "CHK_document_counters_prefix";

/**
 * Per-type number format on top of the counter: `prefix`, zero `padding` and whether the
 * UTC year is printed. The defaults ("", 6, true) reproduce the numbers issued so far
 * ("2026-000042") byte for byte, so existing accounts see no change.
 *
 * The prefix may not end with a digit: the number then always ends in one maximal digit
 * run that is the counter value, so two different formats can never print the same text
 * for different values, and the unique index on receipts needs no format awareness. The
 * second CHECK keeps characters out that would break file names or HTML attributes.
 *
 * Additive: constant defaults add the columns without rewriting the table, and the old
 * application image never reads them, so it keeps issuing "YYYY-NNNNNN" numbers.
 */
export class DocumentNumberingFormat1793400000000
  implements MigrationInterface
{
  name = "DocumentNumberingFormat1793400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_counters"
         ADD COLUMN "prefix" varchar(16) NOT NULL DEFAULT '',
         ADD COLUMN "padding" smallint NOT NULL DEFAULT 6,
         ADD COLUMN "include_year" boolean NOT NULL DEFAULT true,
         ADD CONSTRAINT "${PADDING_CHECK}" CHECK ("padding" BETWEEN 1 AND 9),
         ADD CONSTRAINT "${PREFIX_CHECK}" CHECK (
           "prefix" !~ '[0-9]$' AND "prefix" !~ '[/\\\\"[:cntrl:]]'
         )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_counters"
         DROP CONSTRAINT "${PREFIX_CHECK}",
         DROP CONSTRAINT "${PADDING_CHECK}",
         DROP COLUMN "include_year",
         DROP COLUMN "padding",
         DROP COLUMN "prefix"`,
    );
  }
}
