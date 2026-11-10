import type { DocumentRequestBody } from "./api";
import type { DocumentConfig } from "./document-config";
import { documentToday } from "./document-clock";
import {
  DOCUMENT_TYPE_META,
  remainingReturnQty,
  type CreatableType,
  type ReturnableItem,
} from "./document-types";

export const MAX_PAYMENT_TERM_DAYS = 365;
export const MAX_CONTRACT_REF_LENGTH = 200;
export const DEFAULT_PAYMENT_TERM_DAYS = 5;
export const QUOTE_DEFAULT_VALIDITY_DAYS = 14;
export const QUOTE_MAX_VALIDITY_DAYS = 365;
export const MAX_QUOTE_TERMS_LENGTH = 300;
/** Mirror of the backend's ACT_COMPLETION_TEXT_MAX_LENGTH. */
export const MAX_ACT_COMPLETION_TEXT_LENGTH = 300;
export const MAX_RETURN_REASON_LENGTH = 300;

export type PaymentTermMode = "days" | "date";

export type InvoiceForm = {
  mode: PaymentTermMode;
  days: string;
  dueDate: string;
};

/** An empty `completionText` means the language's standard sentence: the field is not sent. */
export type ActForm = { contractRef: string; completionText: string; from: string; to: string };

export type QuoteForm = {
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
};

/**
 * Which lines are ticked and the quantity typed for each (a ticked line without an edit
 * returns everything that is left). Remaining units are read from the order when the form
 * is validated, so a refreshed order never leaves a stale limit behind.
 */
export type ReturnNoteForm = {
  selectedItemIds: readonly string[];
  quantities: Readonly<Record<string, string>>;
  reason: string;
};

type InvoiceDetails = Extract<DocumentRequestBody, { type: "invoice" }>["details"];
type ActDetails = Extract<DocumentRequestBody, { type: "act" }>["details"];
type QuoteDetails = Extract<DocumentRequestBody, { type: "quote" }>["details"];
type ReturnNoteDetails = Extract<DocumentRequestBody, { type: "return_note" }>["details"];

/** Field → translation key of the problem. */
export type DetailsErrors = Partial<Record<string, string>>;

export type Built<Value> =
  | { ok: true; value: Value }
  | { ok: false; errors: DetailsErrors };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Only one of `dueDate` / `paymentTermDays` is ever sent: the server refuses both. */
export function buildInvoiceDetails(
  form: InvoiceForm,
  today?: string,
): Built<InvoiceDetails> {
  if (form.mode === "date") {
    if (!isCalendarDate(form.dueDate))
      return { ok: false, errors: { dueDate: "documents.errors.dueDateInvalid" } };
    // `today` is the calendar day in the document time zone, as the server counts it.
    if (today && form.dueDate < today)
      return { ok: false, errors: { dueDate: "documents.errors.dueDateBeforeToday" } };
    if (today && form.dueDate > addDays(today, MAX_PAYMENT_TERM_DAYS))
      return { ok: false, errors: { dueDate: "documents.errors.dueDateTooFar" } };
    return { ok: true, value: { dueDate: form.dueDate } };
  }
  const days = Number(form.days);
  const isValid =
    form.days.trim() !== "" &&
    Number.isInteger(days) &&
    days >= 1 &&
    days <= MAX_PAYMENT_TERM_DAYS;
  return isValid
    ? { ok: true, value: { paymentTermDays: days } }
    : { ok: false, errors: { paymentTermDays: "documents.errors.termDaysInvalid" } };
}

/** Which of the two period dates is wrong, so each input carries its own message. */
export function periodErrors(form: ActForm): DetailsErrors {
  const { from, to } = form;
  if (from === "" && to === "") return {};
  if (!isCalendarDate(from)) return { periodFrom: "documents.errors.periodFromRequired" };
  if (!isCalendarDate(to)) return { periodTo: "documents.errors.periodToRequired" };
  return from > to ? { periodTo: "documents.errors.periodOrder" } : {};
}

const PERIOD_FIELDS = ["periodFrom", "periodTo"] as const;

/**
 * The errors to keep after the act period changed: a period message disappears once the dates no
 * longer have that problem, instead of staying until the next submit. Other fields are untouched.
 */
export function withResolvedPeriodErrors(errors: DetailsErrors, form: ActForm): DetailsErrors {
  const current = periodErrors(form);
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([field, message]) =>
        !(PERIOD_FIELDS as readonly string[]).includes(field) || current[field] === message,
    ),
  );
}

export function buildActDetails(form: ActForm): Built<ActDetails> {
  const contractRef = form.contractRef.trim();
  const completionText = form.completionText.trim();
  const errors: DetailsErrors = {
    ...(completionText.length > MAX_ACT_COMPLETION_TEXT_LENGTH && {
      completionText: "documents.errors.completionTextTooLong",
    }),
    ...(contractRef.length > MAX_CONTRACT_REF_LENGTH && {
      contractRef: "documents.errors.contractRefTooLong",
    }),
    ...periodErrors(form),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const hasPeriod = form.from !== "" && form.to !== "";
  return {
    ok: true,
    value: {
      ...(contractRef !== "" && { contractRef }),
      ...(completionText !== "" && { completionText }),
      ...(hasPeriod && { period: { from: form.from, to: form.to } }),
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `date` (YYYY-MM-DD) moved by `days` calendar days; works on UTC so DST never shifts it. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * `validUntil` is sent only when the user changed the suggested date: otherwise the
 * server counts the default from the issue date in the account's time zone.
 */
export function buildQuoteDetails(
  form: QuoteForm,
  defaultValidUntil: string,
  today: string,
): Built<QuoteDetails> {
  const paymentTerms = form.paymentTerms.trim();
  const deliveryTerms = form.deliveryTerms.trim();
  const isDateChanged = form.validUntil !== defaultValidUntil;
  const dateError = (): string | undefined => {
    if (!isCalendarDate(form.validUntil)) return "documents.errors.validUntilInvalid";
    if (form.validUntil < today) return "documents.errors.validUntilBeforeIssue";
    if (form.validUntil > addDays(today, QUOTE_MAX_VALIDITY_DAYS))
      return "documents.errors.validUntilTooFar";
    return undefined;
  };
  const validUntilError = isDateChanged ? dateError() : undefined;
  const errors: DetailsErrors = {
    ...(validUntilError && { validUntil: validUntilError }),
    ...(paymentTerms.length > MAX_QUOTE_TERMS_LENGTH && {
      paymentTerms: "documents.errors.termsTooLong",
    }),
    ...(deliveryTerms.length > MAX_QUOTE_TERMS_LENGTH && {
      deliveryTerms: "documents.errors.termsTooLong",
    }),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(isDateChanged && { validUntil: form.validUntil }),
      ...(paymentTerms !== "" && { paymentTerms }),
      ...(deliveryTerms !== "" && { deliveryTerms }),
    },
  };
}

export const EMPTY_RETURN_NOTE: ReturnNoteForm = {
  selectedItemIds: [],
  quantities: {},
  reason: "",
};

/** Field key under which the quantity problem of one order line is reported. */
export const returnQtyField = (orderItemId: string): string => `qty:${orderItemId}`;

/** The quantity the form currently holds for a line: the typed one, else all that is left. */
export function returnQtyText(form: ReturnNoteForm, item: ReturnableItem): string {
  return form.quantities[item.id] ?? String(remainingReturnQty(item));
}

function returnQtyError(text: string, remaining: number): string | undefined {
  const qty = Number(text);
  if (text.trim() === "" || !Number.isInteger(qty) || qty < 1)
    return "documents.errors.returnQtyInvalid";
  return qty > remaining ? "documents.errors.returnQtyExceeded" : undefined;
}

/** At least one ticked returnable line, each 1..remaining units, and an optional reason of up to 300 characters. */
export function buildReturnNoteDetails(
  form: ReturnNoteForm,
  items: readonly ReturnableItem[],
): Built<ReturnNoteDetails> {
  // A line that came back in full since it was ticked (say, after RETURN_QUANTITY_EXCEEDED and the
  // refetch) has a disabled checkbox the user cannot untick, so it must not keep blocking Create.
  const ticked = items.filter(
    (item) => form.selectedItemIds.includes(item.id) && remainingReturnQty(item) > 0,
  );
  const reason = form.reason.trim();
  const qtyErrors = ticked.flatMap((item) => {
    const key = returnQtyError(returnQtyText(form, item), remainingReturnQty(item));
    return key ? [[returnQtyField(item.id), key] as const] : [];
  });
  const errors: DetailsErrors = {
    ...(ticked.length === 0 && { lines: "documents.errors.returnLinesEmpty" }),
    ...Object.fromEntries(qtyErrors),
    ...(reason.length > MAX_RETURN_REASON_LENGTH && {
      reason: "documents.errors.reasonTooLong",
    }),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      lines: ticked.map((item) => ({
        orderItemId: item.id,
        qty: Number(returnQtyText(form, item)),
      })),
      ...(reason !== "" && { reason }),
    },
  };
}

export type DocumentForms = {
  invoice: InvoiceForm;
  act: ActForm;
  quote: QuoteForm;
  returnNote: ReturnNoteForm;
  /** The order's lines, for the types that pick among them. */
  items: readonly ReturnableItem[];
};

type TemplateId = DocumentConfig["templateId"];

/**
 * What the quote form starts with, and the date the server would pick for it: both count
 * from today in the document time zone, not the browser's.
 */
export type QuoteDefaults = { today: string; validUntil: string };

export function quoteDefaults(
  timeZone: string | undefined,
  now: Date = new Date(),
): QuoteDefaults {
  const today = documentToday(timeZone, now);
  return { today, validUntil: addDays(today, QUOTE_DEFAULT_VALIDITY_DAYS) };
}

/** The POST /receipts/orders/:id/documents body for the chosen type and its form. */
export function buildDocumentRequest(
  type: CreatableType,
  forms: DocumentForms,
  quote: QuoteDefaults,
  templateId?: TemplateId,
): Built<DocumentRequestBody> {
  const overrides = templateId ? { overrides: { templateId } } : {};
  const withDetails = <Value>(
    built: Built<Value>,
    body: (details: Value) => DocumentRequestBody,
  ): Built<DocumentRequestBody> =>
    built.ok ? { ok: true, value: body(built.value) } : built;
  const kind = DOCUMENT_TYPE_META[type].details;
  switch (kind) {
    case null:
      return { ok: true, value: { type, ...overrides } };
    case "invoice":
      return withDetails(buildInvoiceDetails(forms.invoice, quote.today), (details) => ({
        type: "invoice",
        details,
        ...overrides,
      }));
    case "act":
      return withDetails(buildActDetails(forms.act), (details) => ({
        type: "act",
        details,
        ...overrides,
      }));
    case "quote":
      return withDetails(
        buildQuoteDetails(forms.quote, quote.validUntil, quote.today),
        (details) => ({ type: "quote", details, ...overrides }),
      );
    case "return_note":
      return withDetails(
        buildReturnNoteDetails(forms.returnNote, forms.items),
        (details) => ({ type: "return_note", details, ...overrides }),
      );
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/** Maps a server path like `details.period.from` to the form field that shows it. */
export function formFieldOf(serverPath: string): string {
  const [, field, part] = serverPath.split(".");
  if (field === "period") return part === "to" ? "periodTo" : "periodFrom";
  return field ?? serverPath;
}
