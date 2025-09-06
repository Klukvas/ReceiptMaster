import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCurrencyToUAH1700000000003 implements MigrationInterface {
  name = 'UpdateCurrencyToUAH1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Обновляем валюту по умолчанию на UAH
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'UAH'`);
    await queryRunner.query(`UPDATE "products" SET "currency" = 'UAH' WHERE "currency" = 'RUB'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Возвращаем валюту по умолчанию на RUB
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'RUB'`);
    await queryRunner.query(`UPDATE "products" SET "currency" = 'RUB' WHERE "currency" = 'UAH'`);
  }
}
