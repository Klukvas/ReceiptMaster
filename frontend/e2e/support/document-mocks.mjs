// API mocks for the document-creation specs: seller requisites, designs, retention,
// document creation and voiding. Each is a harness handler (see `state.handlers`).

import { RECIPIENTS } from "./fixtures.mjs";

/** An IBAN that passes the ISO 13616 check (the backend DTO's own example). */
export const VALID_IBAN = "UA213223130000026007233566001";

export const COMPLETE_COMPANY = {
  companyName: "Acme Trading",
  companyAddress: "1 Main Street",
  companyEmail: "",
  companyPhone: "",
  companyTaxId: "12345678",
  companyIban: VALID_IBAN,
  companySwift: "",
  companyWebsite: "",
  companyTagline: "",
  companyTaxIdKind: "edrpou",
  companyLegalForm: "LLC",
  companyBankName: "Test Bank",
  companyVatPayer: false,
  companyVatId: null,
  companySignatoryName: "Ivan Petrenko",
  companySignatoryPosition: "Director",
  defaultPaymentTermDays: 14,
};

const FULL = ["waybill", "invoice", "act", "sales_receipt", "packing_list", "quote", "return_note"];
const capabilities = (documentTypes) => ({
  revision: 2,
  companyFields: ["companyName", "companyAddress", "companyEmail", "companyPhone", "companyTaxId", "companyIban", "companySwift", "companyWebsite", "companyTagline"],
  recipientFields: ["recipientName", "recipientAddress", "recipientEmail", "recipientPhone"],
  money: true,
  accent: false,
  terms: false,
  generatedAt: true,
  paper: "A4",
  documentTypes,
  logo: { minWidth: 24, maxWidth: 200, maxHeight: 120, alignments: ["auto", "left", "center", "right"] },
});
const template = (id, name, documentTypes, locked = false) => ({
  id, name, description: "", locked, capabilities: capabilities(documentTypes),
});
export const TEMPLATES = [
  template("standard", "Standard", FULL),
  template("thermal", "Thermal", ["waybill"]),
  template("minimal", "Minimal", FULL, true),
  template("classic", "Classic", FULL),
];

const designConfig = (templateId, company, timeZone = "UTC") => ({
  schemaVersion: 1,
  company: { ...company },
  templateId,
  documentLanguage: "en",
  title: { mode: "automatic" },
  footerTitle: "",
  footerSubtitle: "",
  primaryColor: "",
  paymentTerms: "",
  deliveryTerms: "",
  logo: { assetId: null, visible: true, size: "auto", alignment: "auto" },
  visibility: {
    companyAddress: true, companyEmail: true, companyPhone: true, companyTaxId: true,
    companyIban: true, companySwift: true, companyWebsite: true,
    recipientEmail: true, recipientPhone: true, recipientAddress: true,
  },
  formatting: {
    numberLocale: "en-US", currencyDisplay: "symbol", dateLocale: "document",
    dateStyle: "medium", timeStyle: "none", hourCycle: "h23", timeZone,
  },
});

/** The multipart `payload` field of a document request, parsed. */
export const payloadOf = (body) => {
  const match = /name="payload"\r\n\r\n([\s\S]*?)\r\n--/.exec(body);
  return match ? JSON.parse(match[1]) : null;
};

/** Sends the response and tells the harness the request is answered. */
const answer = async (json, route, body, status) => {
  await json(route, body, status);
  return true;
};

/** The return ledger of the server: a created return note takes its quantities off the order lines. */
const withReturned = (items, payload) => {
  if (payload.type !== "return_note") return items;
  const returned = new Map(payload.details.lines.map((line) => [line.orderItemId, line.qty]));
  return items.map((item) => ({ ...item, returned_qty: item.returned_qty + (returned.get(item.id) ?? 0) }));
};

const requisitesRefusal = {
  error: "Required requisites are missing",
  errorCode: "DOCUMENT_REQUISITES_MISSING",
  fields: ["seller.iban"],
  warnings: ["buyer.taxId", "seller.bankName"],
};

/**
 * @param state mutable spec state; reads `company`, `retention`, `refusal` (true, or a 422 body),
 *   `createError` ({ status, body } for any other refusal of the create request, e.g. a 422 RETURN_QUANTITY_EXCEEDED), `designId`,
 *   `timeZone` (document time zone, default UTC) and records `created` (parsed payloads), `voided` (request bodies) and `retentionQueries`.
 */
export const documentHandlers = (state) => [
  async (route, { path, method, body, search }, json) => {
    if (path === "/settings/company-info" && method === "GET")
      return answer(json, route, { data: state.company ?? COMPLETE_COMPANY });
    if (path === "/settings/company-info" && method === "POST") {
      state.companySaves = [...(state.companySaves ?? []), JSON.parse(body)];
      return answer(json, route, { message: "ok" });
    }
    if (path === "/settings/templates") return answer(json, route, { data: TEMPLATES });
    if (path === "/settings/document-config")
      return answer(json, route, { data: { revision: 1, config: designConfig(state.designId ?? "thermal", state.company ?? COMPLETE_COMPANY, state.timeZone) } });
    if (path === "/receipts/retention") {
      state.retentionQueries = [...(state.retentionQueries ?? []), search];
      return answer(json, route, state.retention ?? { limit: 10, count: 2, replaces: null });
    }
    return false;
  },
  async (route, { path, method, body }, json) => {
    const created = /^\/receipts\/orders\/([^/]+)\/documents$/.exec(path);
    if (created && method === "POST") {
      if (state.refusal)
        return answer(json, route, state.refusal === true ? requisitesRefusal : state.refusal, 422);
      if (state.createError) {
        state.createAttempts = [...(state.createAttempts ?? []), payloadOf(body)];
        return answer(json, route, state.createError.body, state.createError.status);
      }
      const payload = payloadOf(body);
      state.created = [...(state.created ?? []), payload];
      // An order may carry several notes of a repeatable type: number and id them in turn.
      const sameType =
        payload.type === "return_note"
          ? state.orders.flatMap((order) => order.receipts).filter((doc) => doc.document_type === payload.type).length
          : 0;
      const serial = sameType + 1;
      const document = {
        id: sameType === 0 ? `doc-${payload.type}` : `doc-${payload.type}-${serial}`,
        order_id: created[1],
        document_type: payload.type,
        number: `${payload.type.toUpperCase()}-${String(serial).padStart(4, "0")}`,
        status: "generated",
        progress: 100,
        created_at: new Date(Date.now() + serial * 1000).toISOString(),
      };
      state.orders = state.orders.map((order) =>
        order.id === created[1]
          ? { ...order, receipts: [...order.receipts, document], items: withReturned(order.items, payload) }
          : order,
      );
      return answer(json, route, document, 201);
    }
    const voided = /^\/receipts\/([^/]+)\/void$/.exec(path);
    if (voided && method === "POST") {
      state.voided = [...(state.voided ?? []), { id: voided[1], body: JSON.parse(body) }];
      state.orders = state.orders.map((order) => ({
        ...order,
        receipts: order.receipts.map((doc) => (doc.id === voided[1] ? { ...doc, status: "void" } : doc)),
      }));
      return answer(json, route, { id: voided[1], status: "void" });
    }
    return false;
  },
  async (route, { path, method, body }, json) => {
    const recipient = /^\/recipients\/([^/]+)$/.exec(path);
    if (!recipient) return false;
    const stored = { ...RECIPIENTS[0], id: recipient[1], ...(state.recipientFields ?? {}) };
    if (method === "PATCH") {
      state.recipientPatches = [...(state.recipientPatches ?? []), JSON.parse(body)];
      return answer(json, route, stored);
    }
    return method === "GET" ? answer(json, route, stored) : false;
  },
];
