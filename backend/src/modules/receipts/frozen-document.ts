import { ApiErrors } from "../../common/errors/ApiError";
import type { DocumentConfig } from "../settings/document-config";
import {
  buyerFingerprint,
  DocumentBuyer,
  DocumentSeller,
  evaluateRequisites,
} from "./document-requisites";
import {
  DocumentTypeSpec,
  GeneratableDocumentType,
  specFor,
  UA_VAT_RATE_PERCENT,
} from "./document-types";
import { DocumentType } from "./entities/receipt.entity";

/** Payment term when neither the request nor the account settings name one. */
export const FALLBACK_PAYMENT_TERM_DAYS = 5;

export type DocumentDetailsInput = {
  dueDate?: string;
  paymentTermDays?: number;
  contractRef?: string;
  period?: { from: string; to: string };
};

export type DueDateSource =
  | "request_date"
  | "request_days"
  | "settings_default"
  | "fallback";

/** Details as frozen: the invoice term is resolved to a date and says where it came from. */
export type FrozenDetails = {
  dueDate?: string;
  dueDateSource?: DueDateSource;
  contractRef?: string;
  period?: { from: string; to: string };
};

/** The non-waybill part of a snapshot. Never part of the public projection. */
export type FrozenDocument = {
  type: DocumentType;
  title: string;
  details: FrozenDetails;
  /** Calendar date (YYYY-MM-DD) in the document's time zone. */
  issueDate: string;
  seller: DocumentSeller;
  buyer: DocumentBuyer;
  /** VAT rate in force when the document was issued; a replacement keeps it. */
  vatRatePercent: number;
  /** Requisite keys that were absent but did not block generation. */
  warnings: string[];
  buyerFingerprint: string;
};

/** What a retry or a replacement keeps from the frozen document. */
export type FrozenCarryOver = {
  buyer: DocumentBuyer;
  /** Replacement only: the same document keeps its date, resolved details and VAT rate. */
  issueDate?: string;
  details?: FrozenDetails;
  vatRatePercent?: number;
};

export type DocumentRequest = {
  type: GeneratableDocumentType;
  details: DocumentDetailsInput;
  carryOver?: FrozenCarryOver;
};

export type DocumentContext = {
  request: DocumentRequest;
  seller: DocumentSeller;
  /** Live buyer unless the request carries a frozen one. */
  buyer: DocumentBuyer;
  defaultPaymentTermDays: number | null;
};

export function issueDateIn(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysToDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function resolveInvoiceTerm(
  input: DocumentDetailsInput,
  defaultDays: number | null,
  issueDate: string,
): Pick<FrozenDetails, "dueDate" | "dueDateSource"> {
  if (input.dueDate)
    return { dueDate: input.dueDate, dueDateSource: "request_date" };
  if (input.paymentTermDays !== undefined)
    return {
      dueDate: addDaysToDate(issueDate, input.paymentTermDays),
      dueDateSource: "request_days",
    };
  if (defaultDays !== null)
    return {
      dueDate: addDaysToDate(issueDate, defaultDays),
      dueDateSource: "settings_default",
    };
  return {
    dueDate: addDaysToDate(issueDate, FALLBACK_PAYMENT_TERM_DAYS),
    dueDateSource: "fallback",
  };
}

function resolveDetails(
  type: GeneratableDocumentType,
  context: DocumentContext,
  issueDate: string,
): FrozenDetails {
  const { request } = context;
  if (request.carryOver?.details) return request.carryOver.details;
  const input = request.details;
  if (type === DocumentType.INVOICE) {
    const term = resolveInvoiceTerm(
      input,
      context.defaultPaymentTermDays,
      issueDate,
    );
    if (term.dueDate && term.dueDate < issueDate)
      throw ApiErrors.VALIDATION_ERROR(
        "details.dueDate",
        "must not be earlier than the issue date",
      );
    return term;
  }
  if (type === DocumentType.ACT)
    return {
      ...(input.contractRef ? { contractRef: input.contractRef } : {}),
      ...(input.period ? { period: input.period } : {}),
    };
  return {};
}

function titleFor(spec: DocumentTypeSpec, language: string): string {
  const titles = spec.title;
  if (!titles) return "";
  return titles[language as keyof typeof titles] ?? titles.en;
}

/**
 * Validates the requisites and resolves dates and title. Called before a number is
 * allocated (the result is discarded) and again when the snapshot is rendered, so a
 * refusal never burns a number.
 */
export function buildFrozenDocument(
  context: DocumentContext,
  config: DocumentConfig,
  now: Date,
): FrozenDocument {
  const { request, seller, buyer } = context;
  const spec = specFor(request.type);
  const issueDate =
    request.carryOver?.issueDate ??
    issueDateIn(now, config.formatting.timeZone);
  const details = resolveDetails(request.type, context, issueDate);
  const { missing, warnings } = evaluateRequisites(
    request.type,
    seller,
    buyer,
    details,
  );
  if (missing.length > 0)
    throw ApiErrors.DOCUMENT_REQUISITES_MISSING(
      request.type,
      missing,
      warnings,
    );
  return {
    type: request.type,
    title: titleFor(spec, config.documentLanguage),
    details,
    issueDate,
    seller,
    buyer,
    vatRatePercent: request.carryOver?.vatRatePercent ?? UA_VAT_RATE_PERCENT,
    warnings,
    buyerFingerprint: buyerFingerprint(buyer),
  };
}
