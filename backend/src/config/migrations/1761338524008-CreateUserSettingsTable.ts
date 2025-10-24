import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserSettingsTable1761338524008 implements MigrationInterface {
    name = 'CreateUserSettingsTable1761338524008'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "templateId" character varying NOT NULL DEFAULT 'standard', "companyName" character varying, "companyAddress" character varying, "companyEmail" character varying, "companyPhone" character varying, "companyTaxId" character varying, "companyIban" character varying, "companySwift" character varying, "companyWebsite" character varying, "companyTagline" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_986a2b6d3c05eb4091bb8066f78" UNIQUE ("userId"), CONSTRAINT "PK_00f004f5922a0744d174530d639" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "user_settings"`);
    }

}
