// Node-only checks on the translation files: en, ru and uk must offer the same
// keys with the same {{placeholders}}, the landing page's template count must equal
// the backend template registry it describes, and the plan numbers and template lists
// (the display catalogue and the landing pricing cards) must equal the backend's PLAN_LIMITS.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Results } from "./support/runner.mjs";
import { loadTsModule } from "./support/transpile.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCALES = ["en", "ru", "uk"];
const TEMPLATE_METADATA = resolve(
  ROOT,
  "backend/src/modules/receipts/templates/metadata.ts",
);
const PLAN_CONFIG = resolve(
  ROOT,
  "backend/src/modules/subscription/config/plans.config.ts",
);
const PLAN_CATALOG_FILE = resolve(ROOT, "frontend/src/lib/plan-catalog.ts");
const ALL_DOCUMENT_TYPES = 7;
const PLACEHOLDER = /\{\{\s*([^}\s]+)\s*\}\}/g;
// A number standing alone, so "SHA256" or "S3" are not read as counts.
const STANDALONE_NUMBER = /(?<![\p{L}\p{N}])\d+(?![\p{L}\p{N}])/gu;
const MAX_LISTED = 20;

const readLocale = (locale) =>
  JSON.parse(
    readFileSync(resolve(ROOT, `frontend/src/locales/${locale}/translation.json`), "utf8"),
  );

/** Every leaf as "a.b.c" (or "a.list[0]") → value. */
const flatten = (value, prefix = "") => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flatten(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      flatten(item, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [[prefix, value]];
};

const placeholders = (value) =>
  typeof value === "string"
    ? [...new Set([...value.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort()
    : [];

const listed = (items) =>
  items.length > MAX_LISTED
    ? `${items.slice(0, MAX_LISTED).join(", ")} … (+${items.length - MAX_LISTED})`
    : items.join(", ");

/** The registry's entries, evaluated from the TypeScript source itself. */
const templateCount = () =>
  Object.keys(
    // Only the per-template document-type lists read the specs; the count does not.
    loadTsModule(TEMPLATE_METADATA, {
      "../document-types": { DOCUMENT_TYPE_SPECS: {} },
    }).TEMPLATE_METADATA,
  ).length;

const checkParity = (results, flat) => {
  const reference = new Map(flat.en);
  for (const locale of LOCALES.filter((name) => name !== "en")) {
    const other = new Map(flat[locale]);
    const missing = [...reference.keys()].filter((key) => !other.has(key));
    // Russian and Ukrainian have plural forms English lacks (few/many).
    const isExtraPluralForm = (key) => /_(few|many)$/.test(key);
    const extra = [...other.keys()].filter(
      (key) => !reference.has(key) && !isExtraPluralForm(key),
    );
    results.check(
      `${locale}: same keys as en (${reference.size})`,
      missing.length === 0 && extra.length === 0,
      `missing: ${listed(missing)}; extra: ${listed(extra)}`,
    );

    const mismatched = [...reference.entries()]
      .filter(([key]) => other.has(key))
      .filter(
        ([key, value]) =>
          JSON.stringify(placeholders(value)) !==
            JSON.stringify(placeholders(other.get(key))) ||
          typeof value !== typeof other.get(key),
      )
      .map(([key]) => key);
    results.check(
      `${locale}: same {{placeholders}} and value types as en for every key`,
      mismatched.length === 0,
      listed(mismatched),
    );
  }
};

const numbersIn = (text) => (text.match(STANDALONE_NUMBER) ?? []).map(Number);

const checkTemplateCount = (results, translations) => {
  const count = templateCount();
  for (const locale of LOCALES) {
    const { landing } = translations[locale];
    // What the product offers in total; the pricing cards say what each plan gets of it.
    const places = {
      "grid.receipts": `${landing.grid.receipts.description} ${landing.grid.receipts.tag1}`,
      "stats strip": landing.stats.templatesValue,
      "templates title": landing.templates.title,
    };
    for (const [place, text] of Object.entries(places)) {
      const numbers = numbersIn(text);
      results.check(
        `${locale}: the landing template count in ${place} matches TEMPLATE_METADATA (${count})`,
        numbers.length >= 1 && numbers.every((number) => number === count),
        text,
      );
    }
  }
};

const sameNumbers = (actual, expected) =>
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

/**
 * The frontend's display catalogue and the landing pricing cards against the backend's
 * PLAN_LIMITS, so neither can drift from what the server enforces.
 */
const checkPlans = (results, translations) => {
  const { PLAN_LIMITS } = loadTsModule(PLAN_CONFIG);
  const { PLAN_CATALOG } = loadTsModule(PLAN_CATALOG_FILE);
  const allTemplates = templateCount();

  for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
    const entry = PLAN_CATALOG[plan];
    const expected = {
      ordersPerMonth: limits.maxOrdersPerMonth,
      products: limits.maxProducts,
      recipients: limits.maxRecipients,
      templates: limits.allowedTemplateIds?.length ?? allTemplates,
      // Which templates, not only how many: the lock hint names a plan per template.
      templateIds: limits.allowedTemplateIds ? [...limits.allowedTemplateIds].sort() : null,
      documentsKeptPerType: limits.documentsRetainedPerType,
      documentTypes: limits.allowedDocumentTypes?.length ?? ALL_DOCUMENT_TYPES,
      presets: limits.maxPresets,
      analyticsHistoryDays: limits.analyticsHistoryDays,
      hasAttribution: limits.hasAttribution,
      features: Object.keys(limits.features).filter((feature) => limits.features[feature]).sort(),
    };
    const actual = Object.fromEntries(
      Object.keys(expected).map((key) => [
        key,
        Array.isArray(entry[key]) ? [...entry[key]].sort() : entry[key],
      ]),
    );
    results.check(
      `plan-catalog.ts describes the ${plan} plan as the backend's PLAN_LIMITS does`,
      JSON.stringify(actual) === JSON.stringify(expected),
      `catalog ${JSON.stringify(actual)} vs backend ${JSON.stringify(expected)}`,
    );

    for (const locale of LOCALES) {
      const card = translations[locale].landing.pricing[plan];
      const countable = [expected.products, expected.recipients].filter((value) => value !== null);
      const checks = {
        price: [numbersIn(card.price), [entry.monthlyPriceUsd]],
        "feat1 (orders)": [numbersIn(card.feat1), [expected.ordersPerMonth]],
        "feat2 (products, recipients)": [numbersIn(card.feat2), countable],
        "feat3 (templates)": [numbersIn(card.feat3), [expected.templates]],
        "feat4 (analytics days)": [
          numbersIn(card.feat4),
          limits.features.analytics && expected.analyticsHistoryDays !== null
            ? [expected.analyticsHistoryDays]
            : [],
        ],
      };
      for (const [place, [found, wanted]] of Object.entries(checks)) {
        results.check(
          `${locale}: landing ${plan} ${place} states the plan's numbers (${wanted.join(", ") || "none"})`,
          sameNumbers(found, wanted),
          `${card.price} | ${card.feat1} | ${card.feat2} | ${card.feat3} | ${card.feat4}`,
        );
      }
    }
  }
};

/** The plan a lock names for a template must be the cheapest backend plan that allows it. */
const checkTemplateUnlocking = (results) => {
  const { PLAN_LIMITS } = loadTsModule(PLAN_CONFIG);
  const { PLAN_ORDER, planUnlocking } = loadTsModule(PLAN_CATALOG_FILE);
  const templateIds = Object.keys(
    loadTsModule(TEMPLATE_METADATA, {
      "../document-types": { DOCUMENT_TYPE_SPECS: {} },
    }).TEMPLATE_METADATA,
  );
  const allows = (plan, id) => PLAN_LIMITS[plan].allowedTemplateIds?.includes(id) ?? true;
  const wrong = templateIds
    .filter((id) => !allows("free", id))
    .map((id) => [id, planUnlocking("templates", "free", id), PLAN_ORDER.find((plan) => allows(plan, id))])
    .filter(([, named, cheapest]) => named !== cheapest);
  results.check(
    `plan-catalog.ts names the cheapest backend plan for each of the ${templateIds.length} templates`,
    templateIds.length > 0 && wrong.length === 0,
    wrong.map(([id, named, cheapest]) => `${id}: ${named} instead of ${cheapest}`).join("; "),
  );
};

export const run = async () => {
  const results = new Results("locale parity");
  const translations = Object.fromEntries(
    LOCALES.map((locale) => [locale, readLocale(locale)]),
  );
  const flat = Object.fromEntries(
    LOCALES.map((locale) => [locale, flatten(translations[locale])]),
  );
  checkParity(results, flat);
  checkTemplateCount(results, translations);
  checkPlans(results, translations);
  checkTemplateUnlocking(results);
  return results;
};
