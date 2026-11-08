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
const capabilities = (documentTypes, signoff = true) => ({
  revision: 2,
  companyFields: ["companyName", "companyAddress", "companyEmail", "companyPhone", "companyTaxId", "companyIban", "companySwift", "companyWebsite", "companyTagline"],
  recipientFields: ["recipientName", "recipientAddress", "recipientEmail", "recipientPhone"],
  money: true,
  accent: false,
  terms: false,
  generatedAt: true,
  signoff,
  paper: "A4",
  documentTypes,
  logo: { minWidth: 24, maxWidth: 200, maxHeight: 120, alignments: ["auto", "left", "center", "right"] },
});
const template = (id, name, documentTypes, locked = false) => ({
  id, name, description: "", locked, capabilities: capabilities(documentTypes, id !== "thermal"),
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

// ─── Documents list, numbering and signature/stamp ───────────────────────────

const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF\n");
/** A 1x1 transparent PNG. */
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const SORT_COLUMNS = { created_at: "created_at", number: "number", document_type: "document_type", status: "status" };

const matchesList = (doc, query) => {
  const day = (iso) => iso.slice(0, 10);
  const needle = (query.get("search") ?? "").toLowerCase();
  return (
    (!query.get("type") || doc.document_type === query.get("type")) &&
    (!query.get("status") || doc.status === query.get("status")) &&
    (!query.get("startDate") || day(doc.created_at) >= query.get("startDate")) &&
    (!query.get("endDate") || day(doc.created_at) <= query.get("endDate")) &&
    (!needle ||
      doc.number.toLowerCase().includes(needle) ||
      (doc.order?.recipient_name ?? "").toLowerCase().includes(needle))
  );
};

/** A row of GET /receipts. */
export const listedDocument = (id, type, status, order, extra = {}) => ({
  id,
  order_id: order?.id ?? "order-x",
  document_type: type,
  number: `${type.slice(0, 3).toUpperCase()}-${id}`,
  pdf_url: status === "generated" ? `/pdf/${id}` : null,
  hash: null,
  status,
  template_id: "standard",
  template_version: 1,
  progress: status === "processing" ? 40 : 100,
  error_message: null,
  created_at: "2026-03-10T10:00:00.000Z",
  voided_at: null,
  void_reason: null,
  public_token: null,
  active_revision: 1,
  replacement_status: null,
  replacement_error: null,
  order,
  ...extra,
});

/**
 * GET /receipts with the documented filters, plus pdf, share and void for listed documents.
 * @param state reads/writes `documents`; records `listQueries` (query strings), `voided`, `shared`.
 *   `listError` makes the list answer 500.
 */
export const documentsListHandlers = (state) => [
  async (route, { path, method, search, body }, json) => {
    if (path === "/receipts" && method === "GET") {
      state.listQueries = [...(state.listQueries ?? []), search];
      if (state.listError) return answer(json, route, { error: "Boom", errorCode: "INTERNAL_SERVER_ERROR" }, 500);
      const query = new URLSearchParams(search);
      const column = SORT_COLUMNS[query.get("sortBy")] ?? "created_at";
      const direction = query.get("sortOrder") === "ASC" ? 1 : -1;
      const matching = state.documents
        .filter((doc) => matchesList(doc, query))
        .sort((a, b) => String(a[column]).localeCompare(String(b[column])) * direction);
      const offset = Number(query.get("offset") ?? 0);
      const limit = Number(query.get("limit") ?? 20);
      return answer(json, route, { data: matching.slice(offset, offset + limit), total: matching.length, offset, limit });
    }
    const one = /^\/receipts\/([^/]+)(\/pdf|\/share|\/void)?$/.exec(path);
    if (!one || one[1] === "retention" || one[1] === "printers" || one[1] === "orders") return false;
    const doc = state.documents.find((candidate) => candidate.id === one[1]);
    if (!doc) return false;
    if (one[2] === "/pdf" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/pdf", body: PDF_BYTES });
      return true;
    }
    if (one[2] === "/share" && method === "POST") {
      state.shared = [...(state.shared ?? []), doc.id];
      return answer(json, route, { token: "tok-1", url: "http://127.0.0.1/r/tok-1" });
    }
    if (one[2] === "/void" && method === "POST") {
      if (state.voidError) return answer(json, route, state.voidError.body, state.voidError.status);
      state.voided = [...(state.voided ?? []), { id: doc.id, body: JSON.parse(body) }];
      state.documents = state.documents.map((candidate) =>
        candidate.id === doc.id ? { ...candidate, status: "void", pdf_url: candidate.pdf_url ?? null } : candidate,
      );
      return answer(json, route, { id: doc.id, status: "void" });
    }
    return !one[2] && method === "GET" ? answer(json, route, doc) : false;
  },
];

export const NUMBERING_TYPES = ["waybill", "invoice", "quote", "act", "sales_receipt", "packing_list", "return_note"];

const numberOf = (setting, year = new Date().getUTCFullYear()) =>
  `${setting.prefix}${setting.includeYear ? `${year}-` : ""}${String(setting.nextValue).padStart(setting.padding, "0")}`;

/** A numbering setting as the API returns it. */
export const numberingSetting = (documentType, extra = {}) => {
  const setting = { documentType, prefix: "", padding: 6, includeYear: true, nextValue: 43, minStart: 43, ...extra };
  return { ...setting, nextNumber: numberOf(setting) };
};

/**
 * GET/PUT /settings/document-numbering[/:type].
 * @param state `numbering` (array), records `numberingSaves` ({ type, body }); `numberingFailure`
 *   ({ status, body }) answers the next PUT with that error instead of saving.
 */
export const numberingHandlers = (state) => [
  async (route, { path, method, body }, json) => {
    if (path === "/settings/document-numbering" && method === "GET")
      return answer(json, route, { types: state.numbering });
    const put = /^\/settings\/document-numbering\/([^/]+)$/.exec(path);
    if (!put || method !== "PUT") return false;
    const payload = JSON.parse(body);
    state.numberingSaves = [...(state.numberingSaves ?? []), { type: put[1], body: payload }];
    if (state.numberingFailure) {
      const { status, body: failure } = state.numberingFailure;
      state.numberingFailure = null;
      return answer(json, route, failure, status);
    }
    const current = state.numbering.find((setting) => setting.documentType === put[1]);
    const nextValue = payload.startNumber ?? current.nextValue;
    const saved = numberingSetting(put[1], {
      prefix: payload.prefix,
      padding: payload.padding,
      includeYear: payload.includeYear,
      nextValue,
      minStart: nextValue,
    });
    state.numbering = state.numbering.map((setting) => (setting.documentType === put[1] ? saved : setting));
    return answer(json, route, saved);
  },
];

/** A SignoffImage as the API returns it. */
export const signoffImage = (assetId, extra = {}) => ({
  assetId,
  width: 800,
  height: 300,
  bytes: 20480,
  updatedAt: "2026-03-10T10:00:00.000Z",
  ...extra,
});

/**
 * GET/PUT/DELETE /settings/signoff[/:kind[/image]].
 * @param state `signoff` ({ signature, stamp }); records `signoffUploads` ({ kind, fileName, contentType }),
 *   `signoffDeletes`; `signoffFailure` ({ status, body }) answers the next upload with that error.
 */
export const signoffHandlers = (state) => [
  async (route, { path, method, body }, json) => {
    if (path === "/settings/signoff" && method === "GET") return answer(json, route, state.signoff);
    const one = /^\/settings\/signoff\/(signature|stamp)(\/image)?$/.exec(path);
    if (!one) return false;
    const kind = one[1];
    if (one[2] && method === "GET") {
      await route.fulfill({ status: 200, contentType: "image/png", body: PNG_BYTES });
      return true;
    }
    if (method === "PUT") {
      const file = /name="file"; filename="([^"]*)"\r\nContent-Type: ([^\r]*)/.exec(body);
      state.signoffUploads = [...(state.signoffUploads ?? []), { kind, fileName: file?.[1], contentType: file?.[2] }];
      if (state.signoffFailure) {
        const { status, body: failure } = state.signoffFailure;
        state.signoffFailure = null;
        return answer(json, route, failure, status);
      }
      const image = signoffImage(`asset-${state.signoffUploads.length}`);
      state.signoff = { ...state.signoff, [kind]: image };
      return answer(json, route, image);
    }
    if (method === "DELETE") {
      state.signoffDeletes = [...(state.signoffDeletes ?? []), kind];
      state.signoff = { ...state.signoff, [kind]: null };
      await route.fulfill({ status: 204 });
      return true;
    }
    return false;
  },
];
