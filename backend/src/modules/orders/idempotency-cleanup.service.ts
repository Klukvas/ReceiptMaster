import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { IdempotencyKey } from "./entities/idempotency-key.entity";

@Injectable()
export class IdempotencyCleanupService {
  private readonly logger = new Logger(IdempotencyCleanupService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private idempotencyKeyRepository: Repository<IdempotencyKey>,
  ) {}

  @Cron("0 */6 * * *")
  async cleanupExpiredKeys(): Promise<void> {
    try {
      const result = await this.idempotencyKeyRepository.delete({
        expires_at: LessThan(new Date()),
      });

      if (result.affected > 0) {
        this.logger.log(
          `Cleaned up ${result.affected} expired idempotency keys`,
        );
      }
    } catch (error) {
      this.logger.error("Failed to cleanup expired idempotency keys:", error);
    }
  }
}
