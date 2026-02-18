import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHeaderTextToUserSettings1761349000000
  implements MigrationInterface
{
  name = "AddHeaderTextToUserSettings1761349000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "headerText" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "headerText"`,
    );
  }
}
