import type { DocumentRequestBody } from "./api";
import type { DocumentConfig } from "./document-config";
import { DOCUMENT_TYPE_META, type CreatableType } from "./document-types";

export const MAX_PAYMENT_TERM_DAYS = 365;
export const MAX_CONTRACT_REF_LENGTH = 200;
export const DEFAULT_PAYMENT_TERM_DAYS = 5;

export type PaymentTermMode = "days" | "date";

export type InvoiceForm = {
  mode: PaymentTermMode;
  days: string;
  dueDate: string;
};

export type ActForm = { contractRef: string; from: string; to: string };

type InvoiceDetails = Extract<DocumentRequestBody, { type: "invoice" }>["details"];
type ActDetails = Extract<DocumentRequestBody, { type: "act" }>["details"];

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
export function buildInvoiceDetails(form: InvoiceForm): Built<InvoiceDetails> {
  if (form.mode === "date") {
    return isCalendarDate(form.dueDate)
      ? { ok: true, value: { dueDate: form.dueDate } }
      : { ok: false, errors: { dueDate: "documents.errors.dueDateInvalid" } };
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

function periodErrors(form: ActForm): DetailsErrors {
  const { from, to } = form;
  if (from === "" && to === "") return {};
  if (!isCalendarDate(from) || !isCalendarDate(to))
    return { period: "documents.errors.periodIncomplete" };
  return from > to ? { period: "documents.errors.periodOrder" } : {};
}

export function buildActDetails(form: ActForm): Built<ActDetails> {
  const contractRef = form.contractRef.trim();
  const errors: DetailsErrors = {
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
      ...(hasPeriod && { period: { from: form.from, to: form.to } }),
    },
  };
}

export type DocumentForms = { invoice: InvoiceForm; act: ActForm };

type TemplateId = DocumentConfig["templateId"];

/** The POST /receipts/orders/:id/documents body for the chosen type and its form. */
export function buildDocumentRequest(
  type: CreatableType,
  forms: DocumentForms,
  templateId?: TemplateId,
): Built<DocumentRequestBody> {
  const overrides = templateId ? { overrides: { templateId } } : {};
  if (DOCUMENT_TYPE_META[type].details === null) {
    return { ok: true, value: { type, ...overrides } };
  }
  if (type === "invoice") {
    const built = buildInvoiceDetails(forms.invoice);
    return built.ok
      ? { ok: true, value: { type, details: built.value, ...overrides } }
      : built;
  }
  const built = buildActDetails(forms.act);
  return built.ok
    ? { ok: true, value: { type, details: built.value, ...overrides } }
    : built;
}

/** Maps a server path like `details.period.from` to the form field that shows it. */
export function formFieldOf(serverPath: string): string {
  const [, field] = serverPath.split(".");
  return field ?? serverPath;
}
