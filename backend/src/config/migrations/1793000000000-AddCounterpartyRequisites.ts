import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Optional legal requisites for both sides of a document: the seller (account settings)
 * and the buyer (recipients). Every column is nullable without a default, so existing rows
 * stay valid and no backfill is needed.
 *
 * `companyTaxId` and `companyIban` keep their historical free text, so only the new
 * columns carry CHECKs. The recipient checks tie the tax id to its kind, which a document
 * needs to print "ЄДРПОУ" or "РНОКПП" correctly.
 */
export class AddCounterpartyRequisites1793000000000
  implements MigrationInterface
{
  name = "AddCounterpartyRequisites1793000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
        ADD COLUMN "companyTaxIdKind" character varying(10),
        ADD COLUMN "companyLegalForm" character varying(64),
        ADD COLUMN "companyBankName" character varying(200),
        ADD COLUMN "companyVatPayer" boolean,
        ADD COLUMN "companyVatId" character varying(12),
        ADD COLUMN "companySignatoryName" character varying(255),
        ADD COLUMN "companySignatoryPosition" character varying(255),
        ADD COLUMN "defaultPaymentTermDays" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "user_settings"
        ADD CONSTRAINT "CHK_user_settings_tax_id_kind"
          CHECK ("companyTaxIdKind" IN ('edrpou', 'rnokpp')),
        ADD CONSTRAINT "CHK_user_settings_vat_id"
          CHECK ("companyVatId" ~ '^(\\d{10}|\\d{12})$'),
        ADD CONSTRAINT "CHK_user_settings_payment_term_days"
          CHECK ("defaultPaymentTermDays" BETWEEN 1 AND 365)
    `);

    await queryRunner.query(`
      ALTER TABLE "recipients"
        ADD COLUMN "legal_name" character varying(255),
        ADD COLUMN "tax_id" character varying(10),
        ADD COLUMN "tax_id_kind" character varying(10),
        ADD COLUMN "iban" character varying(29),
        ADD COLUMN "bank_name" character varying(200),
        ADD COLUMN "legal_address" text
    `);
    await queryRunner.query(`
      ALTER TABLE "recipients"
        ADD CONSTRAINT "CHK_recipients_tax_id"
          CHECK ("tax_id" ~ '^(\\d{8}|\\d{10})$'),
        ADD CONSTRAINT "CHK_recipients_tax_id_kind"
          CHECK ("tax_id_kind" IN ('edrpou', 'rnokpp')),
        ADD CONSTRAINT "CHK_recipients_tax_id_with_kind"
          CHECK (("tax_id" IS NULL) = ("tax_id_kind" IS NULL)),
        ADD CONSTRAINT "CHK_recipients_tax_id_kind_length"
          CHECK (
            "tax_id_kind" IS NULL
            OR ("tax_id_kind" = 'edrpou' AND length("tax_id") = 8)
            OR ("tax_id_kind" = 'rnokpp' AND length("tax_id") = 10)
          ),
        ADD CONSTRAINT "CHK_recipients_iban"
          CHECK ("iban" ~ '^UA\\d{27}$')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recipients"
        DROP CONSTRAINT "CHK_recipients_iban",
        DROP CONSTRAINT "CHK_recipients_tax_id_kind_length",
        DROP CONSTRAINT "CHK_recipients_tax_id_with_kind",
        DROP CONSTRAINT "CHK_recipients_tax_id_kind",
        DROP CONSTRAINT "CHK_recipients_tax_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "recipients"
        DROP COLUMN "legal_address",
        DROP COLUMN "bank_name",
        DROP COLUMN "iban",
        DROP COLUMN "tax_id_kind",
        DROP COLUMN "tax_id",
        DROP COLUMN "legal_name"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_settings"
        DROP CONSTRAINT "CHK_user_settings_payment_term_days",
        DROP CONSTRAINT "CHK_user_settings_vat_id",
        DROP CONSTRAINT "CHK_user_settings_tax_id_kind"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_settings"
        DROP COLUMN "defaultPaymentTermDays",
        DROP COLUMN "companySignatoryPosition",
        DROP COLUMN "companySignatoryName",
        DROP COLUMN "companyVatId",
        DROP COLUMN "companyVatPayer",
        DROP COLUMN "companyBankName",
        DROP COLUMN "companyLegalForm",
        DROP COLUMN "companyTaxIdKind"
    `);
  }
}
