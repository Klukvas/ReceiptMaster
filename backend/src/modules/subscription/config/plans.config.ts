import { PlanName } from "../entities/user-subscription.entity";

/**
 * Document types by their stored value. Listed here instead of importing the receipts
 * entity, so the plan table stays a leaf that every module can read.
 */
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

export interface PlanLimits {
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

/** The template every plan has: the fallback when a saved one is no longer allowed. */
export const DEFAULT_TEMPLATE_ID = "standard";

const START_TEMPLATE_IDS = [
  DEFAULT_TEMPLATE_ID,
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

const NO_FEATURES: Record<PlanFeature, boolean> = {
  analytics: false,
  profit: false,
  csvExport: false,
  logo: false,
  signoff: false,
  customNumbering: false,
  autoReceipt: false,
  suppliers: false,
  stockInsights: false,
};

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

/**
 * The stored plan names predate the public ones: `pro` is sold as "Start" and `business`
 * as "Pro". Renaming the stored values would break a rollback, so only the labels changed.
 */
export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxProducts: 10,
    maxOrdersPerMonth: 20,
    maxRecipients: 10,
    allowedTemplateIds: [DEFAULT_TEMPLATE_ID],
    allowedDocumentTypes: ["waybill", "invoice", "sales_receipt"],
    documentsRetainedPerType: 10,
    maxPresets: 0,
    analyticsHistoryDays: null,
    hasAttribution: true,
    features: NO_FEATURES,
  },
  pro: {
    maxProducts: 500,
    maxOrdersPerMonth: 150,
    maxRecipients: 300,
    allowedTemplateIds: START_TEMPLATE_IDS,
    allowedDocumentTypes: null,
    documentsRetainedPerType: 100,
    maxPresets: 3,
    analyticsHistoryDays: 90,
    hasAttribution: false,
    features: { ...ALL_FEATURES, csvExport: false },
  },
  business: {
    maxProducts: null,
    maxOrdersPerMonth: 1500,
    maxRecipients: null,
    allowedTemplateIds: null,
    allowedDocumentTypes: null,
    documentsRetainedPerType: null,
    maxPresets: 20,
    analyticsHistoryDays: null,
    hasAttribution: false,
    features: ALL_FEATURES,
  },
};
