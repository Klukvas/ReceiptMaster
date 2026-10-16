import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runWithTenant } from "../../../common/tenancy/tenant-context";
import { DocumentAssetsService } from "../../settings/services/document-assets.service";
import { DocumentArtifactsService } from "./document-artifacts.service";

@Injectable()
export class DocumentStorageMaintenanceService {
  private readonly logger = new Logger(DocumentStorageMaintenanceService.name);
  private running = false;
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly assets: DocumentAssetsService,
    private readonly artifacts: DocumentArtifactsService,
  ) {}

  @Interval(60000)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Claim at most ten tenants. No configuration or customer content is scanned globally.
      // TypeORM's Postgres driver returns [rows, rowCount] for UPDATE ... RETURNING, not rows.
      const [tenants]: [Array<{ user_id: string }>, number] =
        await this.db.transaction((manager) =>
          manager.query(`
        WITH due AS (SELECT user_id FROM document_storage_sweeps WHERE next_sweep_at < now()
          ORDER BY next_sweep_at,user_id LIMIT 10 FOR UPDATE SKIP LOCKED)
        UPDATE document_storage_sweeps s SET next_sweep_at=now()+interval '1 hour'
        FROM due WHERE s.user_id=due.user_id RETURNING s.user_id`),
        );
      for (const { user_id } of tenants) {
        try {
          await runWithTenant(user_id, async () => {
            for (const collector of [this.assets, this.artifacts]) {
              try {
                await collector.collectExpired(user_id);
              } catch (error) {
                this.logger.warn(
                  `Collector will retry: ${error instanceof Error ? error.message : "cleanup failed"}`,
                );
              }
            }
          });
        } catch (error) {
          this.logger.warn(
            `Storage cleanup will retry: ${error instanceof Error ? error.message : "cleanup failed"}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Storage maintenance unavailable: ${error instanceof Error ? error.message : "sweep failed"}`,
      );
    } finally {
      this.running = false;
    }
  }
}
