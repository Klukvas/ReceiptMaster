import { ErrorCode, errorBodyOf, httpStatusOf } from "./api-errors";
import { UPGRADE_REASONS, type UpgradeReason } from "./plan-catalog";

const HTTP_PAYMENT_REQUIRED = 402;

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
 * A 402 from the API: every one is a plan refusal. `reason` is what the plan lacks, or
 * null when this client does not know the code or the feature (a newer server). An unknown
 * refusal is never guessed to be the limit of the form it came from.
 */
export interface PlanRefusal {
  reason: UpgradeReason | null;
}

/**
 * The plan refusal behind an error, or null for any other error. A refusal can slip past
 * the client's pre-check when the cached subscription status is stale.
 */
export function planRefusalOf(error: unknown): PlanRefusal | null {
  if (httpStatusOf(error) !== HTTP_PAYMENT_REQUIRED) return null;
  const body = errorBodyOf(error);
  const code = typeof body?.errorCode === "string" ? body.errorCode : "";
  if (code === ErrorCode.PLAN_FEATURE_RESTRICTED)
    return { reason: isUpgradeReason(body?.feature) ? body.feature : null };
  return { reason: REASON_BY_CODE[code] ?? null };
}
