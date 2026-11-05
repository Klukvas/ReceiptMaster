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
          newValues:
            method !== "DELETE" ? this.sanitize(request.body) : undefined,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]?.substring(0, 500),
          requestId: request["requestId"],
        });
      }),
    );
  }

  private mapAction(method: string, handlerName: string): string {
    if (handlerName.startsWith("create") || handlerName.startsWith("register"))
      return "CREATE";
    if (
      handlerName.startsWith("update") ||
      handlerName.startsWith("confirm") ||
      handlerName.startsWith("cancel")
    )
      return "UPDATE";
    if (handlerName.startsWith("delete") || handlerName.startsWith("remove"))
      return "DELETE";
    if (handlerName.startsWith("void")) return "VOID";
    if (method === "POST") return "CREATE";
    if (method === "PUT" || method === "PATCH") return "UPDATE";
    if (method === "DELETE") return "DELETE";
    return method;
  }

  private sanitize(body: Record<string, any>): Record<string, any> | undefined {
    if (!body || typeof body !== "object") return undefined;
    return maskSensitive(body, 0) as Record<string, any>;
  }
}

const MASKED = "***";
const MAX_DEPTH = 8;
const SECRET_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "refreshtoken",
]);
// Counterparty and bank requisites: kept out of the log, the field name still shows that it changed.
const REQUISITE_KEY =
  /iban|taxid|legalname|legaladdress|bankname|vatid|signatory|contractref|companyaddress/;

const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[_-]/g, "");

function maskSensitive(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return MASKED;
  if (Array.isArray(value))
    return value.map((item) => maskSensitive(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const normalized = normalizeKey(key);
      const isSensitive =
        SECRET_KEYS.has(normalized) || REQUISITE_KEY.test(normalized);
      return [key, isSensitive ? MASKED : maskSensitive(item, depth + 1)];
    }),
  );
}
