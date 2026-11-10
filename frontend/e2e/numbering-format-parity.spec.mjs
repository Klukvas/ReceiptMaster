// The frontend keeps a client copy of the backend's document number format (live preview in
// Settings > Documents). Both must print the same text for the same trimmed prefix, or the
// example would promise a number the server does not issue.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Results } from "./support/runner.mjs";
import { loadTsModule } from "./support/transpile.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKEND = resolve(ROOT, "backend/src/modules/receipts/receipt-number.ts");
const FRONTEND = resolve(ROOT, "frontend/src/lib/document-number-format.ts");

const PREFIXES = [
  "",
  "КП",
  "РФ-",
  "A.",
  "A",
  "INV_",
  "Рах 2",
  "рахунок",
  "№",
  "A-B",
  "x/",
];
const VALUES = [1, 43, 999999, 2_000_000_000];
const PADDINGS = [1, 6, 9];

export const run = async () => {
  const results = new Results("numbering format parity");
  const backend = loadTsModule(BACKEND, {
    typeorm: {},
    "./entities/receipt.entity": { DocumentType: { WAYBILL: "waybill" } },
    "./frozen-document": { issueDateIn: () => "" },
    "./receipt-number-sql": {},
  });
  const frontend = loadTsModule(FRONTEND);

  const known = {
    КП: "КП-2026-000001",
    "РФ-": "РФ-2026-000001",
    "A.": "A.2026-000001",
  };
  for (const [prefix, expected] of Object.entries(known)) {
    const printed = frontend.formatDocumentNumber(
      { prefix, padding: 6, includeYear: true },
      1,
      2026,
    );
    results.check(
      `client prints "${prefix}" as ${expected}`,
      printed === expected,
      printed,
    );
  }

  const mismatches = [];
  for (const prefix of PREFIXES)
    for (const padding of PADDINGS)
      for (const includeYear of [true, false])
        for (const value of VALUES) {
          const fromBackend = backend.formatDocumentNumber(
            { prefix, padding, includeYear },
            value,
            2026,
          );
          const fromFrontend = frontend.formatDocumentNumber(
            { prefix, padding, includeYear },
            value,
            2026,
          );
          if (fromBackend !== fromFrontend)
            mismatches.push(
              `${JSON.stringify({ prefix, padding, includeYear, value })}: ${fromBackend} != ${fromFrontend}`,
            );
        }
  results.check(
    "client and backend print the same number for every sampled format",
    mismatches.length === 0,
    mismatches.slice(0, 3).join("; "),
  );
  return results;
};
