// DOCUMENT_TYPE_META (frontend) mirrors DOCUMENT_TYPE_SPECS (backend). The
// facts the UI relies on — which orders may get the document, which seller
// requisites block it, which only warn — must not drift apart.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Results } from "./support/runner.mjs";
import { loadTsModule } from "./support/transpile.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKEND = resolve(ROOT, "backend/src/modules/receipts/document-types.ts");
const FRONTEND = resolve(ROOT, "frontend/src/lib/document-types.ts");

// The backend file imports two enums at runtime; their values are all it needs.
const BACKEND_STUBS = {
  "../orders/entities/order.entity": { OrderStatus: { CONFIRMED: "confirmed" } },
  "./entities/receipt.entity": {
    DocumentType: {
      WAYBILL: "waybill",
      INVOICE: "invoice",
      ACT: "act",
      SALES_RECEIPT: "sales_receipt",
      PACKING_LIST: "packing_list",
    },
  },
};
// The frontend file only uses lucide icons at runtime; any placeholder will do.
const FRONTEND_STUBS = {
  "lucide-react": {
    FileText: "i",
    Receipt: "i",
    ClipboardCheck: "i",
    ShoppingBag: "i",
    Package: "i",
  },
};

const sorted = (list) => JSON.stringify([...list].sort());

export const run = async () => {
  const results = new Results("document types parity");
  const specs = loadTsModule(BACKEND, BACKEND_STUBS).DOCUMENT_TYPE_SPECS;
  const meta = loadTsModule(FRONTEND, FRONTEND_STUBS).DOCUMENT_TYPE_META;

  results.check(
    "same set of generatable types",
    sorted(Object.keys(specs)) === sorted(Object.keys(meta)),
    `${Object.keys(specs)} vs ${Object.keys(meta)}`,
  );

  for (const type of Object.keys(specs)) {
    const spec = specs[type];
    const entry = meta[type];
    if (!entry) continue;
    results.check(
      `${type}: allowed order statuses`,
      sorted(spec.allowedOrderStatuses) === sorted(entry.allowedOrderStatuses),
      `${spec.allowedOrderStatuses} vs ${entry.allowedOrderStatuses}`,
    );
    results.check(
      `${type}: required seller requisites`,
      sorted(spec.requiredSeller) === sorted(entry.requiredSeller),
      `${spec.requiredSeller} vs ${entry.requiredSeller}`,
    );
    results.check(
      `${type}: VAT number required from a VAT payer`,
      spec.requiresVatIdForPayer === entry.requiresVatIdForPayer,
      `${spec.requiresVatIdForPayer} vs ${entry.requiresVatIdForPayer}`,
    );
    results.check(
      `${type}: soft warnings`,
      sorted(spec.warnings) === sorted(entry.warnings),
      `${spec.warnings} vs ${entry.warnings}`,
    );
    results.check(
      `${type}: label key follows documentTypes.<type>`,
      entry.labelKey === `documentTypes.${type}`,
      entry.labelKey,
    );
  }

  return results;
};
