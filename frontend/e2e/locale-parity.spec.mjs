// Node-only checks on the translation files: en, ru and uk must offer the same
// keys with the same {{placeholders}}, and the landing page's template count
// must equal the backend template registry it describes.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Results } from "./support/runner.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCALES = ["en", "ru", "uk"];
const TEMPLATE_METADATA = resolve(
  ROOT,
  "backend/src/modules/receipts/templates/metadata.ts",
);
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
const templateCount = () => {
  const { outputText } = ts.transpileModule(
    readFileSync(TEMPLATE_METADATA, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  );
  const module = { exports: {} };
  const noRuntimeImports = (id) => {
    throw new Error(`metadata.ts imports ${id} at runtime; extend this check`);
  };
  new Function("module", "exports", "require", outputText)(
    module,
    module.exports,
    noRuntimeImports,
  );
  return Object.keys(module.exports.TEMPLATE_METADATA).length;
};

const checkParity = (results, flat) => {
  const reference = new Map(flat.en);
  for (const locale of LOCALES.filter((name) => name !== "en")) {
    const other = new Map(flat[locale]);
    const missing = [...reference.keys()].filter((key) => !other.has(key));
    const extra = [...other.keys()].filter((key) => !reference.has(key));
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

const checkTemplateCount = (results, translations) => {
  const count = templateCount();
  for (const locale of LOCALES) {
    const { description, tag1 } = translations[locale].landing.grid.receipts;
    const numbers = [`${description} ${tag1}`.match(STANDALONE_NUMBER) ?? []]
      .flat()
      .map(Number);
    results.check(
      `${locale}: the landing template count matches TEMPLATE_METADATA (${count})`,
      numbers.length === 2 && numbers.every((number) => number === count),
      `${description} | ${tag1}`,
    );
  }
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
  return results;
};
