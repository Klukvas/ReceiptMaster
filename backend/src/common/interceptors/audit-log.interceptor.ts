import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { AuditLogService } from "../services/audit-log.service";

const AUDIT_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Webhooks from Telegram and Paddle carry third-party payloads (chat messages, customer
 * and payment data) that the audit log has no use for; only the call itself is recorded.
 * Matched by controller, not by path: Express routes are case-insensitive, so `/TG/webhook`
 * reaches the same handler and a path rule would have to mirror that.
 */
const WEBHOOK_CONTROLLERS = new Set(["TelegramController", "PaddleController"]);

/** Bodies whose top level is a person or a business contact: its contact fields are personal data. */
const BODY_SCOPE_BY_CONTROLLER: Readonly<Record<string, MaskScope>> = {
  RecipientsController: "recipient",
  SuppliersController: "supplier",
};

/** A void body is `{ reason }`: free text about why, often naming the customer. */
const bodyScopeFor = (
  controllerName: string,
  handlerName: string,
): MaskScope =>
  handlerName.startsWith("void")
    ? "void"
    : (BODY_SCOPE_BY_CONTROLLER[controllerName] ?? "plain");

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
    const isWebhook = WEBHOOK_CONTROLLERS.has(controllerName);
    const handlerName = context.getHandler().name;
    const bodyScope = bodyScopeFor(controllerName, handlerName);
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
            method !== "DELETE" && !isWebhook
              ? this.sanitize(request.body, bodyScope)
              : undefined,
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

  private sanitize(
    body: Record<string, any>,
    scope: MaskScope,
  ): Record<string, any> | undefined {
    if (!body || typeof body !== "object") return undefined;
    return maskSensitive(unpackMultipartPayload(body), 0, scope) as Record<
      string,
      any
    >;
  }
}

/**
 * A multipart document request carries its JSON in one `payload` string field, which key
 * masking cannot see into. Open it so the requisites inside are masked like in a JSON body;
 * a string that is not JSON is hidden altogether rather than logged raw.
 */
function unpackMultipartPayload(body: Record<string, any>) {
  if (typeof body.payload !== "string") return body;
  try {
    return { ...body, payload: JSON.parse(body.payload) as unknown };
  } catch {
    return { ...body, payload: MASKED };
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

// Personal contact data under an explicit name. The same names are visibility switches
// (booleans) in a document configuration, which stay readable.
const CONTACT_KEY =
  /^recipient(name|email|phone|address)$|^company(email|phone)$|swift/;

/**
 * Where a key sits decides what it means: `name` of a recipient is a person, of a product
 * it is not; `reason` in document details is free text about the customer.
 */
type MaskScope = "plain" | "recipient" | "supplier" | "details" | "void";
const SCOPED_KEYS: Record<MaskScope, ReadonlySet<string>> = {
  plain: new Set(),
  recipient: new Set(["name", "email", "phone", "address"]),
  supplier: new Set([
    "name",
    "email",
    "phone",
    "address",
    "contactperson",
    "notes",
  ]),
  details: new Set([
    "reason",
    "completiontext",
    "paymentterms",
    "deliveryterms",
  ]),
  void: new Set(["reason"]),
};
const PARENT_KEY_SCOPES: Readonly<Record<string, MaskScope>> = {
  recipient: "recipient",
  recipients: "recipient",
  supplier: "supplier",
  suppliers: "supplier",
  details: "details",
};

const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[_-]/g, "");

const scopeBelow = (normalizedKey: string): MaskScope =>
  PARENT_KEY_SCOPES[normalizedKey] ?? "plain";

/** Absent values and on/off switches say nothing about the person; anything else may. */
const carriesPersonalData = (item: unknown): boolean =>
  item !== null && item !== undefined && typeof item !== "boolean";

function isMaskedKey(normalized: string, item: unknown, scope: MaskScope) {
  if (SECRET_KEYS.has(normalized)) return true;
  if (!carriesPersonalData(item)) return false;
  return (
    REQUISITE_KEY.test(normalized) ||
    CONTACT_KEY.test(normalized) ||
    SCOPED_KEYS[scope].has(normalized)
  );
}

function maskSensitive(
  value: unknown,
  depth: number,
  scope: MaskScope,
): unknown {
  if (depth > MAX_DEPTH) return MASKED;
  if (Array.isArray(value))
    return value.map((item) => maskSensitive(item, depth + 1, scope));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const normalized = normalizeKey(key);
      return [
        key,
        isMaskedKey(normalized, item, scope)
          ? MASKED
          : maskSensitive(item, depth + 1, scopeBelow(normalized)),
      ];
    }),
  );
}
