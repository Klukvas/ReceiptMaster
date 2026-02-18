import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditLog } from "../entities/audit-log.entity";

export interface AuditLogParams {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      const entry = this.auditLogRepository.create({
        user_id: params.userId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        old_values: params.oldValues,
        new_values: params.newValues,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        request_id: params.requestId,
      });

      await this.auditLogRepository.save(entry);
    } catch (error) {
      this.logger.error("Failed to write audit log:", error);
    }
  }
}
