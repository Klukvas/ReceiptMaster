import { api } from "./api";

export type PlanName = "free" | "pro" | "business";

/** Document types by their stored value, as the plan table lists them. */
export type PlanDocumentType =
  | "waybill"
  | "invoice"
  | "quote"
  | "act"
  | "sales_receipt"
  | "packing_list"
  | "return_note";

/** Capabilities a plan either has or lacks; anything countable is a limit instead. */
export type PlanFeature =
  | "analytics"
  | "profit"
  | "csvExport"
  | "logo"
  | "signoff"
  | "customNumbering"
  | "autoReceipt"
  | "suppliers"
  | "stockInsights";

/** Mirror of the backend's `PlanLimits` (`subscription/config/plans.config.ts`). */
export interface SubscriptionLimits {
  maxProducts: number | null;
  maxOrdersPerMonth: number | null;
  maxRecipients: number | null;
  /** null = every template */
  allowedTemplateIds: string[] | null;
  /** null = every document type */
  allowedDocumentTypes: PlanDocumentType[] | null;
  /** Generated documents kept per type; null = all of them */
  documentsRetainedPerType: number | null;
  maxPresets: number;
  /** How far back analytics may look; null = the whole history */
  analyticsHistoryDays: number | null;
  /** Documents carry a "Made with ReceiptMaster" line */
  hasAttribution: boolean;
  features: Record<PlanFeature, boolean>;
}

export interface SubscriptionUsage {
  productsCount: number;
  ordersThisMonth: number;
  recipientsCount: number;
}

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "scheduled_cancel"
  | "paused"
  | "canceled";

export interface SubscriptionStatus {
  plan: PlanName;
  usage: SubscriptionUsage;
  limits: SubscriptionLimits;
  billingStatus: BillingStatus | null;
  currentPeriodEnd: string | null;
  hasBillingSubscription: boolean;
}

const ALL_FEATURES: Record<PlanFeature, boolean> = {
  analytics: true,
  profit: true,
  csvExport: true,
  logo: true,
  signoff: true,
  customNumbering: true,
  autoReceipt: true,
  suppliers: true,
  stockInsights: true,
};

/** What a missing field means: no restriction, the same answer as an unknown status. */
const UNRESTRICTED_LIMITS: SubscriptionLimits = {
  maxProducts: null,
  maxOrdersPerMonth: null,
  maxRecipients: null,
  allowedTemplateIds: null,
  allowedDocumentTypes: null,
  documentsRetainedPerType: null,
  maxPresets: 20,
  analyticsHistoryDays: null,
  hasAttribution: false,
  features: ALL_FEATURES,
};

const FEATURE_NAMES = Object.keys(ALL_FEATURES) as PlanFeature[];
const BILLING_STATUSES: readonly BillingStatus[] = [
  "active",
  "trialing",
  "past_due",
  "scheduled_cancel",
  "paused",
  "canceled",
];

/** Thrown for a body that is not a subscription status; the query then reports an error. */
class MalformedStatusError extends Error {
  constructor(field: string) {
    super(`Malformed subscription status: ${field}`);
    this.name = "MalformedStatusError";
  }
}

type Json = Record<string, unknown>;
type Check<T> = (value: unknown) => value is T;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isCountOrNull = (value: unknown): value is number | null =>
  value === null || isCount(value);
const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
const isStringListOrNull = (value: unknown): value is string[] | null =>
  value === null ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));
// A plan this build does not know (a newer server) is kept and shown as sent.
const isPlanName = (value: unknown): value is PlanName =>
  typeof value === "string" && value.length > 0;
const isBillingStatusOrNull = (value: unknown): value is BillingStatus | null =>
  value === null || BILLING_STATUSES.some((status) => status === value);

/**
 * One field of the body. An API that predates a field (the frontend can be deployed
 * first) simply does not send it and gets `fallback`; a field of the wrong type means the
 * body cannot be trusted at all.
 */
const read = <T>(
  source: Json,
  field: string,
  check: Check<T>,
  fallback: T,
): T => {
  const value = source[field];
  if (value === undefined) return fallback;
  if (!check(value)) throw new MalformedStatusError(field);
  return value;
};

const section = (source: Json, field: string): Json => {
  const value = source[field] ?? {};
  if (!isRecord(value)) throw new MalformedStatusError(field);
  return value;
};

const parseLimits = (raw: Json): SubscriptionLimits => {
  const features = section(raw, "features");
  const defaults = UNRESTRICTED_LIMITS;
  const allowedDocumentTypes = read(
    raw,
    "allowedDocumentTypes",
    isStringListOrNull,
    defaults.allowedDocumentTypes,
  );
  return {
    maxProducts: read(raw, "maxProducts", isCountOrNull, defaults.maxProducts),
    maxOrdersPerMonth: read(
      raw,
      "maxOrdersPerMonth",
      isCountOrNull,
      defaults.maxOrdersPerMonth,
    ),
    maxRecipients: read(
      raw,
      "maxRecipients",
      isCountOrNull,
      defaults.maxRecipients,
    ),
    allowedTemplateIds: read(
      raw,
      "allowedTemplateIds",
      isStringListOrNull,
      defaults.allowedTemplateIds,
    ),
    // Compared by value only (`isDocumentTypeAllowed`), so an unknown type is harmless.
    allowedDocumentTypes: allowedDocumentTypes as PlanDocumentType[] | null,
    documentsRetainedPerType: read(
      raw,
      "documentsRetainedPerType",
      isCountOrNull,
      defaults.documentsRetainedPerType,
    ),
    maxPresets: read(raw, "maxPresets", isCount, defaults.maxPresets),
    analyticsHistoryDays: read(
      raw,
      "analyticsHistoryDays",
      isCountOrNull,
      defaults.analyticsHistoryDays,
    ),
    hasAttribution: read(
      raw,
      "hasAttribution",
      isBoolean,
      defaults.hasAttribution,
    ),
    features: Object.fromEntries(
      FEATURE_NAMES.map((feature) => [
        feature,
        read(features, feature, isBoolean, true),
      ]),
    ) as Record<PlanFeature, boolean>,
  };
};

/**
 * The status as the UI reads it, built field by field from an untrusted body. A missing
 * limit is filled with "not restricted", so nothing is locked on a guess and the server
 * keeps the last word; a malformed body throws, which the UI treats as an unknown status.
 */
export const parseSubscriptionStatus = (raw: unknown): SubscriptionStatus => {
  if (!isRecord(raw) || !isPlanName(raw.plan))
    throw new MalformedStatusError("plan");
  const usage = section(raw, "usage");
  return {
    plan: raw.plan,
    usage: {
      productsCount: read(usage, "productsCount", isCount, 0),
      ordersThisMonth: read(usage, "ordersThisMonth", isCount, 0),
      recipientsCount: read(usage, "recipientsCount", isCount, 0),
    },
    limits: parseLimits(section(raw, "limits")),
    billingStatus: read(raw, "billingStatus", isBillingStatusOrNull, null),
    currentPeriodEnd: read(raw, "currentPeriodEnd", isStringOrNull, null),
    hasBillingSubscription: read(
      raw,
      "hasBillingSubscription",
      isBoolean,
      false,
    ),
  };
};

export const subscriptionApi = {
  getStatus: async (): Promise<SubscriptionStatus> => {
    const response = await api.get<unknown>("/subscription/status");
    return parseSubscriptionStatus(response.data);
  },

  checkout: async (
    plan: "pro" | "business",
  ): Promise<{ checkoutUrl: string }> => {
    const response = await api.post<{ checkoutUrl: string }>(
      "/subscription/checkout",
      { plan },
    );
    return response.data;
  },

  portal: async (): Promise<{ url: string }> => {
    const response = await api.post<{ url: string }>("/subscription/portal");
    return response.data;
  },
  /** Each of the three answers with the status as it is after the change. */
  changePlan: async (plan: "pro" | "business"): Promise<SubscriptionStatus> => {
    const response = await api.post<unknown>("/subscription/change-plan", {
      plan,
    });
    return parseSubscriptionStatus(response.data);
  },

  cancel: async (): Promise<SubscriptionStatus> => {
    const response = await api.post<unknown>("/subscription/cancel");
    return parseSubscriptionStatus(response.data);
  },

  resume: async (): Promise<SubscriptionStatus> => {
    const response = await api.post<unknown>("/subscription/resume");
    return parseSubscriptionStatus(response.data);
  },
};

/**
 * A canceled subscription stays on record until its paid period ends, but it no longer
 * renews: the user may buy a new one. Any other status is managed on the subscription tab.
 */
export const hasLiveSubscription = (
  status: SubscriptionStatus | null | undefined,
): boolean =>
  !!status?.hasBillingSubscription && status.billingStatus !== "canceled";

/** The plan can be switched or the subscription cancelled only while it renews normally. */
export const canChangePlan = (
  status: SubscriptionStatus | null | undefined,
): boolean =>
  !!status?.hasBillingSubscription &&
  (status.billingStatus === "active" || status.billingStatus === "trialing");

export const canCancelSubscription = (
  status: SubscriptionStatus | null | undefined,
): boolean => canChangePlan(status) || isPastDue(status);

const isPastDue = (status: SubscriptionStatus | null | undefined): boolean =>
  !!status?.hasBillingSubscription && status.billingStatus === "past_due";

export const canResumeSubscription = (
  status: SubscriptionStatus | null | undefined,
): boolean =>
  !!status?.hasBillingSubscription &&
  status.billingStatus === "scheduled_cancel";

/**
 * The one rule for a status that is not known (still loading, or the request failed):
 * nothing is locked. A lock shown on a guess would hide paid features from a paying
 * user, while a wrong "unlocked" costs one refused request, which the server answers
 * with a 402 that the UI explains. Every helper below therefore takes an optional
 * status and answers "allowed" / "not reached" without one.
 *
 * Requests to plan-gated endpoints are the other half: they wait until the status has
 * settled (see `usePlan().isSettled`), so a Free account never sends them at all.
 */
type MaybeStatus = SubscriptionStatus | null | undefined;

export const planAllows = (
  status: MaybeStatus,
  feature: PlanFeature,
): boolean => (status ? status.limits.features[feature] === true : true);

const isCountLimitReached = (used: number, limit: number | null): boolean =>
  limit !== null && used >= limit;

export const isProductLimitReached = (status: MaybeStatus): boolean =>
  !!status &&
  isCountLimitReached(status.usage.productsCount, status.limits.maxProducts);

export const isOrderLimitReached = (status: MaybeStatus): boolean =>
  !!status &&
  isCountLimitReached(
    status.usage.ordersThisMonth,
    status.limits.maxOrdersPerMonth,
  );

export const isRecipientLimitReached = (status: MaybeStatus): boolean =>
  !!status &&
  isCountLimitReached(
    status.usage.recipientsCount,
    status.limits.maxRecipients,
  );

/** Presets are not part of `usage`; the caller passes how many the account has. */
export const isPresetLimitReached = (
  status: MaybeStatus,
  presetsCount: number,
): boolean => !!status && presetsCount >= status.limits.maxPresets;

export const isDocumentTypeAllowed = (
  status: MaybeStatus,
  type: string,
): boolean => {
  const allowed = status?.limits.allowedDocumentTypes;
  return !allowed || allowed.some((allowedType) => allowedType === type);
};

export const isTemplateAllowed = (
  status: MaybeStatus,
  templateId: string,
): boolean => {
  const allowed = status?.limits.allowedTemplateIds;
  return !allowed || allowed.includes(templateId);
};
