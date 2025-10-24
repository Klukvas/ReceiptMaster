import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceiptTitleToUserSettings1761341614540 implements MigrationInterface {
    name = 'AddReceiptTitleToUserSettings1761341614540'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_settings" ADD "receiptTitle" character varying NOT NULL DEFAULT 'Invoice'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "receiptTitle"`);
    }

}
