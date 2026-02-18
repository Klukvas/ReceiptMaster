import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { AuditLogService } from "../services/audit-log.service";

const AUDIT_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (!AUDIT_METHODS.has(method)) {
      return next.handle();
    }

    const user = request.user;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const entityType = controllerName.replace("Controller", "").toLowerCase();
    const entityId = request.params?.id || request.params?.orderId;

    return next.handle().pipe(
      tap((responseData) => {
        const action = this.mapAction(method, handlerName);
        this.auditLogService.log({
          userId: user?.id,
          action,
          entityType,
          entityId: entityId || responseData?.id,
          newValues: method !== "DELETE" ? this.sanitize(request.body) : undefined,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]?.substring(0, 500),
          requestId: request["requestId"],
        });
      }),
    );
  }

  private mapAction(method: string, handlerName: string): string {
    if (handlerName.startsWith("create") || handlerName.startsWith("register")) return "CREATE";
    if (handlerName.startsWith("update") || handlerName.startsWith("confirm") || handlerName.startsWith("cancel")) return "UPDATE";
    if (handlerName.startsWith("delete") || handlerName.startsWith("remove")) return "DELETE";
    if (handlerName.startsWith("void")) return "VOID";
    if (method === "POST") return "CREATE";
    if (method === "PUT" || method === "PATCH") return "UPDATE";
    if (method === "DELETE") return "DELETE";
    return method;
  }

  private sanitize(body: Record<string, any>): Record<string, any> | undefined {
    if (!body || typeof body !== "object") return undefined;
    const sanitized = { ...body };
    const sensitiveFields = ["password", "currentPassword", "newPassword", "confirmPassword", "refresh_token"];
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = "***";
      }
    }
    return sanitized;
  }
}
