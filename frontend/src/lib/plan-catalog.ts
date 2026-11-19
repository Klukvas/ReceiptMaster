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
  /** null = every generated document is kept */
  documentsKeptPerType: number | null;
  documentTypes: number;
  presets: number;
  /** null = the whole history; ignored without the analytics feature */
  analyticsHistoryDays: number | null;
  hasAttribution: boolean;
  features: readonly PlanFeature[];
}

export const PLAN_ORDER: readonly PlanName[] = ["free", "pro", "business"];
export type PaidPlan = Exclude<PlanName, "free">;

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
    templates: 1,
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
    templates: 10,
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

const nextPlanAbove = (plan: PlanName): PaidPlan =>
  plan === "free" ? "pro" : "business";

/**
 * The cheapest plan that lifts the restriction for an account on `currentPlan`: the
 * first plan that has the capability, or simply the next one up for a countable limit.
 */
export const planUnlocking = (
  reason: UpgradeReason,
  currentPlan: PlanName,
): PaidPlan => {
  if (reason === "analyticsHistory") return "business";
  if (reason === "documentTypes") return "pro";
  if (!isPlanFeature(reason)) return nextPlanAbove(currentPlan);
  return PLAN_CATALOG.pro.features.includes(reason) ? "pro" : "business";
};

/** The paid plans worth offering for a reason: the unlocking one and everything above it. */
export const plansOfferedFor = (
  reason: UpgradeReason,
  currentPlan: PlanName,
): PaidPlan[] => {
  if (currentPlan === "business") return [];
  const unlocking = planUnlocking(reason, currentPlan);
  return unlocking === "pro" && currentPlan === "free"
    ? ["pro", "business"]
    : ["business"];
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
    entry.documentTypes < PLAN_CATALOG.business.documentTypes
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
