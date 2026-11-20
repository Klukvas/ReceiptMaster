import type { TFunction } from "i18next";
import type { PlanFeature, PlanName } from "./subscriptionApi";

/**
 * The three plans as they are SHOWN: names, prices and the lines of the comparison cards.
 * It is a display copy of the backend's `PLAN_LIMITS` (`e2e/locale-parity.spec.mjs` keeps
 * the two equal). What the current account may actually do never comes from here: usage
 * bars, limit rows and locks read `limits` of `GET /subscription/status`.
 *
 * The stored plan names predate the public ones: `pro` is sold as "Start" and `business`
 * as "Pro". `planDisplayName` is the only place that maps one to the other.
 */
export interface PlanCatalogEntry {
  nameKey: string;
  monthlyPriceUsd: number;
  ordersPerMonth: number;
  /** null = unlimited */
  products: number | null;
  recipients: number | null;
  templates: number;
  /** The templates the plan may use; null = every template */
  templateIds: readonly string[] | null;
  /** null = every generated document is kept */
  documentsKeptPerType: number | null;
  documentTypes: number;
  presets: number;
  /** null = the whole history; ignored without the analytics feature */
  analyticsHistoryDays: number | null;
  hasAttribution: boolean;
  features: readonly PlanFeature[];
}

export type PaidPlan = Exclude<PlanName, "free">;
/** Cheapest first. Every "is there a higher plan" question is answered from this order. */
const PAID_PLANS = ["pro", "business"] as const satisfies readonly PaidPlan[];
export const PLAN_ORDER: readonly PlanName[] = ["free", ...PAID_PLANS];
const TOP_PLAN: PaidPlan = PAID_PLANS[PAID_PLANS.length - 1];

const FREE_TEMPLATE_IDS: readonly string[] = ["standard"];
const START_TEMPLATE_IDS: readonly string[] = [
  ...FREE_TEMPLATE_IDS,
  "compact",
  "minimal",
  "thermal",
  "classic",
  "corporate",
  "modern",
  "wave",
  "delivery",
  "proforma",
];

const START_FEATURES: readonly PlanFeature[] = [
  "analytics",
  "profit",
  "logo",
  "signoff",
  "customNumbering",
  "autoReceipt",
  "suppliers",
  "stockInsights",
];

export const PLAN_CATALOG: Record<PlanName, PlanCatalogEntry> = {
  free: {
    nameKey: "subscription.free",
    monthlyPriceUsd: 0,
    ordersPerMonth: 20,
    products: 10,
    recipients: 10,
    templates: FREE_TEMPLATE_IDS.length,
    templateIds: FREE_TEMPLATE_IDS,
    documentsKeptPerType: 10,
    documentTypes: 3,
    presets: 0,
    analyticsHistoryDays: null,
    hasAttribution: true,
    features: [],
  },
  pro: {
    nameKey: "subscription.pro",
    monthlyPriceUsd: 9,
    ordersPerMonth: 150,
    products: 500,
    recipients: 300,
    templates: START_TEMPLATE_IDS.length,
    templateIds: START_TEMPLATE_IDS,
    documentsKeptPerType: 100,
    documentTypes: 7,
    presets: 3,
    analyticsHistoryDays: 90,
    hasAttribution: false,
    features: START_FEATURES,
  },
  business: {
    nameKey: "subscription.business",
    monthlyPriceUsd: 19,
    ordersPerMonth: 1500,
    products: null,
    recipients: null,
    templates: 15,
    templateIds: null,
    documentsKeptPerType: null,
    documentTypes: 7,
    presets: 20,
    analyticsHistoryDays: null,
    hasAttribution: false,
    features: [...START_FEATURES, "csvExport"],
  },
};

/** "Free" / "Start" / "Pro" for the stored `free` / `pro` / `business`. */
export const planDisplayName = (t: TFunction, plan: PlanName): string =>
  // A plan this build does not know (a newer server) is shown as sent, not as a guess.
  plan in PLAN_CATALOG ? t(PLAN_CATALOG[plan].nameKey) : plan;

export const planMonthlyPrice = (plan: PlanName): string =>
  `$${PLAN_CATALOG[plan].monthlyPriceUsd}`;

/**
 * Why an upgrade is suggested: a limit that was reached or a capability the plan lacks.
 * Each has `subscription.reasons.<reason>.title` and `.description` in every locale.
 */
export const UPGRADE_REASONS = [
  "products",
  "orders",
  "recipients",
  "presets",
  "templates",
  "documentTypes",
  "retention",
  "analyticsHistory",
  "analytics",
  "profit",
  "csvExport",
  "logo",
  "signoff",
  "customNumbering",
  "autoReceipt",
  "suppliers",
  "stockInsights",
] as const;
export type UpgradeReason = (typeof UPGRADE_REASONS)[number];

const isPlanFeature = (reason: UpgradeReason): reason is PlanFeature =>
  PLAN_ORDER.some((plan) =>
    PLAN_CATALOG[plan].features.some((feature) => feature === reason),
  );

/** Position in `PLAN_ORDER`; -1 for a plan this build does not know (a newer server). */
const planRank = (plan: PlanName): number => PLAN_ORDER.indexOf(plan);

/** True when `candidate` sits above `current`: the switch is an upgrade and costs money now. */
export const isHigherPlan = (candidate: PlanName, current: PlanName): boolean =>
  planRank(candidate) > planRank(current);

/** True when the catalog has a plan above this one, so an upgrade can be suggested at all. */
export const hasHigherPlan = (plan: PlanName): boolean => {
  const rank = planRank(plan);
  return rank >= 0 && rank < PLAN_ORDER.length - 1;
};

/** null (no limit) counts as more than any number. */
const isMore = (candidate: number | null, current: number | null): boolean =>
  current !== null && (candidate === null || candidate > current);

/** The countable side of a reason, read from a catalog entry. */
const COUNT_OF: Partial<
  Record<UpgradeReason, (entry: PlanCatalogEntry) => number | null>
> = {
  products: (entry) => entry.products,
  orders: (entry) => entry.ordersPerMonth,
  recipients: (entry) => entry.recipients,
  presets: (entry) => entry.presets,
  templates: (entry) => entry.templates,
  documentTypes: (entry) => entry.documentTypes,
  retention: (entry) => entry.documentsKeptPerType,
  analyticsHistory: (entry) => entry.analyticsHistoryDays,
};

const includesTemplate = (entry: PlanCatalogEntry, templateId: string) =>
  entry.templateIds === null || entry.templateIds.includes(templateId);

/** Does `candidate` lift the restriction an account on `current` ran into? */
const liftsRestriction = (
  reason: UpgradeReason,
  candidate: PlanCatalogEntry,
  current: PlanCatalogEntry | undefined,
  templateId: string | undefined,
): boolean => {
  if (isPlanFeature(reason)) return candidate.features.includes(reason);
  if (reason === "templates" && templateId !== undefined)
    return includesTemplate(candidate, templateId);
  if (
    reason === "analyticsHistory" &&
    !candidate.features.includes("analytics")
  )
    return false;
  const countOf = COUNT_OF[reason];
  if (!countOf || !current) return true;
  return isMore(countOf(candidate), countOf(current));
};

/**
 * The cheapest plan that lifts the restriction for an account on `currentPlan`: the
 * first plan that has the capability (or the given template), or the first one above
 * with a larger limit. Without such a plan the answer is the top one.
 */
export const planUnlocking = (
  reason: UpgradeReason,
  currentPlan: PlanName,
  templateId?: string,
): PaidPlan => {
  const current =
    currentPlan in PLAN_CATALOG ? PLAN_CATALOG[currentPlan] : undefined;
  return (
    PAID_PLANS.find(
      (plan) =>
        planRank(plan) > planRank(currentPlan) &&
        liftsRestriction(reason, PLAN_CATALOG[plan], current, templateId),
    ) ?? TOP_PLAN
  );
};

/**
 * Of several locked templates, the one the cheapest plan unlocks: what one lock standing
 * for all of them names ("Available on Start" is true as soon as Start has one of them).
 */
export const easiestTemplateToUnlock = (
  templateIds: readonly string[],
  currentPlan: PlanName,
): string | undefined => {
  const rankFor = (templateId: string) =>
    planRank(planUnlocking("templates", currentPlan, templateId));
  return [...templateIds].sort((a, b) => rankFor(a) - rankFor(b))[0];
};

/** The paid plans worth offering for a reason: the unlocking one and everything above it. */
export const plansOfferedFor = (
  reason: UpgradeReason,
  currentPlan: PlanName,
  templateId?: string,
): PaidPlan[] => {
  if (!hasHigherPlan(currentPlan)) return [];
  const unlocking = planUnlocking(reason, currentPlan, templateId);
  return PAID_PLANS.filter(
    (plan) =>
      planRank(plan) > planRank(currentPlan) &&
      planRank(plan) >= planRank(unlocking),
  );
};

/** The lines of a plan's comparison card, in the order the plans differ. */
export const planFeatureLines = (t: TFunction, plan: PlanName): string[] => {
  const entry = PLAN_CATALOG[plan];
  const has = (feature: PlanFeature) => entry.features.includes(feature);
  const optional = (isShown: boolean, line: string): string[] =>
    isShown ? [line] : [];
  return [
    t("subscription.ordersLimit", { count: entry.ordersPerMonth }),
    entry.products === null
      ? t("subscription.unlimitedProducts")
      : t("subscription.productsLimit", { count: entry.products }),
    entry.recipients === null
      ? t("subscription.unlimitedRecipients")
      : t("subscription.recipientsLimit", { count: entry.recipients }),
    entry.templates === 1
      ? t("subscription.catalog.oneTemplate")
      : t("subscription.catalog.templates", { count: entry.templates }),
    entry.documentTypes < PLAN_CATALOG[TOP_PLAN].documentTypes
      ? t("subscription.catalog.basicDocumentTypes")
      : t("subscription.catalog.allDocumentTypes", {
          count: entry.documentTypes,
        }),
    entry.documentsKeptPerType === null
      ? t("subscription.catalog.documentsKeptAll")
      : t("subscription.catalog.documentsKept", {
          count: entry.documentsKeptPerType,
        }),
    ...optional(
      has("analytics"),
      entry.analyticsHistoryDays === null
        ? t("subscription.catalog.analyticsFull")
        : t("subscription.catalog.analyticsDays", {
            count: entry.analyticsHistoryDays,
          }),
    ),
    ...optional(has("csvExport"), t("subscription.catalog.csvExport")),
    ...optional(has("logo"), t("subscription.catalog.branding")),
    ...optional(
      entry.presets > 0,
      t("subscription.catalog.presets", { count: entry.presets }),
    ),
    ...optional(has("suppliers"), t("subscription.catalog.suppliersAndStock")),
    ...optional(entry.hasAttribution, t("subscription.catalog.attribution")),
  ];
};

/** The two limits that sum a plan up on an upgrade button. */
export const planHeadline = (t: TFunction, plan: PlanName): string =>
  planFeatureLines(t, plan).slice(0, 2).join(" · ");
