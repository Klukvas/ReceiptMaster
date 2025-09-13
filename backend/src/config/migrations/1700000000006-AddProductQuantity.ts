import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductQuantity1700000000006 implements MigrationInterface {
    name = 'AddProductQuantity1700000000006'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add quantity field to products table
        await queryRunner.query(`
            ALTER TABLE "products" 
            ADD COLUMN "quantity" integer NOT NULL DEFAULT 0
        `);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove quantity field from products table
        await queryRunner.query(`
            ALTER TABLE "products" 
            DROP COLUMN "quantity"
        `);
    }
}
