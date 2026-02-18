import {
  Injectable,
  OnApplicationBootstrap,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { getDataSourceToken } from "@nestjs/typeorm";
import { EnvConfig } from "../../config/env.schema";

@Injectable()
export class MigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    @Inject(getDataSourceToken())
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<EnvConfig>,
  ) {}

  /** Advisory lock key for migrations (CRC32 of "market_migrations") */
  private static readonly MIGRATION_LOCK_ID = 3_217_891_453;

  async onApplicationBootstrap() {
    const autoRunMigrations = this.configService.get("AUTO_RUN_MIGRATIONS");

    if (autoRunMigrations) {
      await this.runWithAdvisoryLock();
    } else {
      this.logger.log(
        "Automatic migrations disabled. Run migrations manually with: yarn migration:run",
      );
    }
  }

  /**
   * Acquire a PG advisory lock so only one instance runs migrations.
   * Other instances block until the lock is released, then skip (no-op).
   */
  private async runWithAdvisoryLock() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      this.logger.log("Acquiring migration advisory lock…");
      await queryRunner.query(`SELECT pg_advisory_lock($1)`, [
        MigrationService.MIGRATION_LOCK_ID,
      ]);

      this.logger.log("Lock acquired — running migrations…");
      await this.dataSource.runMigrations();
      this.logger.log("Database migrations completed successfully");
    } catch (error) {
      this.logger.error("Error running migrations:", error);
      process.exit(1);
    } finally {
      try {
        await queryRunner.query(`SELECT pg_advisory_unlock($1)`, [
          MigrationService.MIGRATION_LOCK_ID,
        ]);
      } catch {
        // lock auto-released when session ends
      }
      await queryRunner.release();
    }
  }
}
