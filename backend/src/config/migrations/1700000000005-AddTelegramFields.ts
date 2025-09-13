import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTelegramFields1700000000005 implements MigrationInterface {
    name = 'AddTelegramFields1700000000005'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add created_by field to orders table
        await queryRunner.query(`
            ALTER TABLE "orders" 
            ADD COLUMN "created_by" varchar(50) NOT NULL DEFAULT 'manually'
        `);

        // Add telegram fields to recipients table
        await queryRunner.query(`
            ALTER TABLE "recipients" 
            ADD COLUMN "telegram_user_id" varchar(50)
        `);

        await queryRunner.query(`
            ALTER TABLE "recipients" 
            ADD COLUMN "username" varchar(255)
        `);

        await queryRunner.query(`
            ALTER TABLE "recipients" 
            ADD COLUMN "first_name" varchar(255)
        `);

        await queryRunner.query(`
            ALTER TABLE "recipients" 
            ADD COLUMN "last_name" varchar(255)
        `);

        // Add unique constraint for telegram_user_id
        await queryRunner.query(`
            ALTER TABLE "recipients" 
            ADD CONSTRAINT "UQ_recipients_telegram_user_id" UNIQUE ("telegram_user_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove unique constraint
        await queryRunner.query(`
            ALTER TABLE "recipients" 
            DROP CONSTRAINT "UQ_recipients_telegram_user_id"
        `);

        // Remove telegram fields from recipients table
        await queryRunner.query(`
            ALTER TABLE "recipients" 
            DROP COLUMN "last_name"
        `);

        await queryRunner.query(`
            ALTER TABLE "recipients" 
            DROP COLUMN "first_name"
        `);

        await queryRunner.query(`
            ALTER TABLE "recipients" 
            DROP COLUMN "username"
        `);

        await queryRunner.query(`
            ALTER TABLE "recipients" 
            DROP COLUMN "telegram_user_id"
        `);

        // Remove created_by field from orders table
        await queryRunner.query(`
            ALTER TABLE "orders" 
            DROP COLUMN "created_by"
        `);
    }
}
