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

type StatusResponse = Omit<SubscriptionStatus, "usage" | "limits"> & {
  usage?: Partial<SubscriptionUsage>;
  limits?: Partial<Omit<SubscriptionLimits, "features">> & {
    features?: Partial<Record<PlanFeature, boolean>>;
  };
};

/**
 * The status as the UI reads it. An API that predates a limit (the frontend can be
 * deployed first) simply does not send it; the gap is filled with "not restricted", so
 * nothing is locked on a guess and the server keeps the last word.
 */
const withLimitDefaults = (raw: StatusResponse): SubscriptionStatus => ({
  ...raw,
  usage: {
    productsCount: raw.usage?.productsCount ?? 0,
    ordersThisMonth: raw.usage?.ordersThisMonth ?? 0,
    recipientsCount: raw.usage?.recipientsCount ?? 0,
  },
  limits: {
    ...UNRESTRICTED_LIMITS,
    ...raw.limits,
    features: { ...ALL_FEATURES, ...raw.limits?.features },
  },
});

export const subscriptionApi = {
  getStatus: async (): Promise<SubscriptionStatus> => {
    const response = await api.get<StatusResponse>("/subscription/status");
    return withLimitDefaults(response.data);
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
};

/**
 * A canceled subscription stays on record until its paid period ends, but it no longer
 * renews: the user may buy a new one. Any other status is managed in the billing portal.
 */
export const hasLiveSubscription = (
  status: SubscriptionStatus | null | undefined,
): boolean =>
  !!status?.hasBillingSubscription && status.billingStatus !== "canceled";

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

export const planAllows = (status: MaybeStatus, feature: PlanFeature): boolean =>
  status ? status.limits.features[feature] === true : true;

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
