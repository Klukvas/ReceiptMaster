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
import type { ReturnLine, ReturnSource } from "./return-note";

/** Payment term when neither the request nor the account settings name one. */
export const FALLBACK_PAYMENT_TERM_DAYS = 5;

/** Days a quotation stays valid when the request names no date. */
export const QUOTE_DEFAULT_VALIDITY_DAYS = 14;
/** The furthest a quotation's validity may reach past its issue date. */
export const QUOTE_MAX_VALIDITY_DAYS = 365;

export type DocumentDetailsInput = {
  dueDate?: string;
  paymentTermDays?: number;
  contractRef?: string;
  period?: { from: string; to: string };
  validUntil?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  lines?: ReturnLine[];
  reason?: string;
};

export type DueDateSource =
  | "request_date"
  | "request_days"
  | "settings_default"
  | "fallback";

export type ValidUntilSource = "request_date" | "default";

/**
 * Details as frozen: the invoice term and the quotation validity are resolved to dates
 * and say where they came from.
 */
export type FrozenDetails = {
  dueDate?: string;
  dueDateSource?: DueDateSource;
  contractRef?: string;
  period?: { from: string; to: string };
  validUntil?: string;
  validUntilSource?: ValidUntilSource;
  paymentTerms?: string;
  deliveryTerms?: string;
  /** Return note: the lines taken back, what they are returned against, and why. */
  returnLines?: ReturnLine[];
  returnReason?: string;
  returnSource?: ReturnSource;
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
  /** Return note only: resolved from the order's documents before the snapshot is built. */
  returnSource?: ReturnSource;
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

function resolveInvoiceDetails(
  input: DocumentDetailsInput,
  defaultDays: number | null,
  issueDate: string,
): FrozenDetails {
  const term = resolveInvoiceTerm(input, defaultDays, issueDate);
  if (term.dueDate && term.dueDate < issueDate)
    throw ApiErrors.INVOICE_DUE_DATE_BEFORE_ISSUE_DATE(term.dueDate, issueDate);
  return term;
}

function resolveQuoteDetails(
  input: DocumentDetailsInput,
  issueDate: string,
): FrozenDetails {
  const validUntil =
    input.validUntil ?? addDaysToDate(issueDate, QUOTE_DEFAULT_VALIDITY_DAYS);
  if (validUntil < issueDate)
    throw ApiErrors.VALIDATION_ERROR(
      "details.validUntil",
      "must not be earlier than the issue date",
    );
  if (validUntil > addDaysToDate(issueDate, QUOTE_MAX_VALIDITY_DAYS))
    throw ApiErrors.VALIDATION_ERROR(
      "details.validUntil",
      `must be within ${QUOTE_MAX_VALIDITY_DAYS} days of the issue date`,
    );
  return {
    validUntil,
    validUntilSource: input.validUntil ? "request_date" : "default",
    ...(input.paymentTerms ? { paymentTerms: input.paymentTerms } : {}),
    ...(input.deliveryTerms ? { deliveryTerms: input.deliveryTerms } : {}),
  };
}

function resolveReturnDetails(
  input: DocumentDetailsInput,
  source: ReturnSource | undefined,
): FrozenDetails {
  if (!input.lines || input.lines.length === 0)
    throw ApiErrors.VALIDATION_ERROR("details.lines", "must not be empty");
  if (!source) throw new Error("A return note needs its source resolved");
  return {
    returnLines: input.lines.map((line) => ({ ...line })),
    ...(input.reason ? { returnReason: input.reason } : {}),
    returnSource: source,
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
  switch (type) {
    case DocumentType.INVOICE:
      return resolveInvoiceDetails(
        input,
        context.defaultPaymentTermDays,
        issueDate,
      );
    case DocumentType.ACT:
      return {
        ...(input.contractRef ? { contractRef: input.contractRef } : {}),
        ...(input.period ? { period: input.period } : {}),
      };
    case DocumentType.QUOTE:
      return resolveQuoteDetails(input, issueDate);
    case DocumentType.RETURN_NOTE:
      return resolveReturnDetails(input, context.returnSource);
    default:
      return {};
  }
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
