import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserRelationsToOrdersAndReceipts1761232571111
  implements MigrationInterface
{
  name = "AddUserRelationsToOrdersAndReceipts1761232571111";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Добавляем колонки user_id как nullable сначала
    await queryRunner.query(`ALTER TABLE "orders" ADD "user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD "user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "receipts" ADD "user_id" uuid`);

    // Получаем первого пользователя для заполнения существующих записей
    const users = await queryRunner.query(`SELECT id FROM "users" LIMIT 1`);
    if (users.length > 0) {
      const defaultUserId = users[0].id;
      // Заполняем существующие записи первым пользователем
      await queryRunner.query(
        `UPDATE "orders" SET "user_id" = $1 WHERE "user_id" IS NULL`,
        [defaultUserId],
      );
      await queryRunner.query(
        `UPDATE "order_items" SET "user_id" = $1 WHERE "user_id" IS NULL`,
        [defaultUserId],
      );
      await queryRunner.query(
        `UPDATE "receipts" SET "user_id" = $1 WHERE "user_id" IS NULL`,
        [defaultUserId],
      );
    }

    // Теперь делаем колонки NOT NULL
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ALTER COLUMN "user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ALTER COLUMN "user_id" SET NOT NULL`,
    );

    // Добавляем внешние ключи
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_bf96e1bdbc1ce2ec1f7fe66e8c2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_6f5a711d2591ddf19f9519900e9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_6f5a711d2591ddf19f9519900e9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_bf96e1bdbc1ce2ec1f7fe66e8c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`,
    );
    await queryRunner.query(`ALTER TABLE "receipts" DROP COLUMN "user_id"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "user_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "user_id"`);
  }
}
