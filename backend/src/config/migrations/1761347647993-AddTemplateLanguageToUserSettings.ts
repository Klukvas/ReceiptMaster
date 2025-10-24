import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTemplateLanguageToUserSettings1761347647993 implements MigrationInterface {
    name = 'AddTemplateLanguageToUserSettings1761347647993'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_settings" ADD "templateLanguage" character varying NOT NULL DEFAULT 'en'`);
        await queryRunner.query(`ALTER TABLE "user_settings" ADD "footerText" character varying`);
        await queryRunner.query(`ALTER TABLE "user_settings" ADD "subFooterText" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "subFooterText"`);
        await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "footerText"`);
        await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "templateLanguage"`);
    }

}
