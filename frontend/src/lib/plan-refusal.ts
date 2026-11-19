import { ErrorCode, errorBodyOf, httpStatusOf } from "./api-errors";
import { UPGRADE_REASONS, type UpgradeReason } from "./plan-catalog";

const HTTP_PAYMENT_REQUIRED = 402;
const HTTP_GONE = 410;

const REASON_BY_CODE: Readonly<Record<string, UpgradeReason>> = {
  [ErrorCode.PRODUCT_LIMIT_EXCEEDED]: "products",
  [ErrorCode.ORDER_MONTHLY_LIMIT_EXCEEDED]: "orders",
  [ErrorCode.RECIPIENT_LIMIT_EXCEEDED]: "recipients",
  [ErrorCode.PRESET_LIMIT_EXCEEDED]: "presets",
  [ErrorCode.TEMPLATE_PLAN_RESTRICTED]: "templates",
  [ErrorCode.DOCUMENT_TYPE_PLAN_RESTRICTED]: "documentTypes",
};

const isUpgradeReason = (value: unknown): value is UpgradeReason =>
  UPGRADE_REASONS.some((reason) => reason === value);

/**
 * The upgrade reason behind a 402 from the API, or null for any other error. A refusal can
 * slip past the client's pre-check when the cached subscription status is stale. A 402 with
 * a code this client does not know still yields a reason (`fallback`), because every 402 of
 * this API is a plan refusal.
 */
export function planRefusalReason(
  error: unknown,
  fallback: UpgradeReason | null = null,
): UpgradeReason | null {
  if (httpStatusOf(error) !== HTTP_PAYMENT_REQUIRED) return null;
  const body = errorBodyOf(error);
  const code = typeof body?.errorCode === "string" ? body.errorCode : "";
  if (code === ErrorCode.PLAN_FEATURE_RESTRICTED)
    return isUpgradeReason(body?.feature) ? body.feature : fallback;
  return REASON_BY_CODE[code] ?? fallback;
}

/** True for the 410 that says a document's file was removed by the plan's retention limit. */
export function isContentPurged(error: unknown): boolean {
  return (
    httpStatusOf(error) === HTTP_GONE &&
    errorBodyOf(error)?.errorCode === ErrorCode.DOCUMENT_CONTENT_PURGED
  );
}
