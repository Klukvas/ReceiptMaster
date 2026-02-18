import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveFirstNameLastNameFromUsers1700000000005
  implements MigrationInterface
{
  name = "RemoveFirstNameLastNameFromUsers1700000000005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "firstName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastName"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "lastName" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "firstName" character varying NOT NULL`,
    );
  }
}
