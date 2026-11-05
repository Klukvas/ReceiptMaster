import type { CompanyInfo, Recipient } from "./api";
import {
  DOCUMENT_TYPE_META,
  type DocumentTypeMeta,
  type GeneratableType,
} from "./document-types";
import {
  inferTaxIdKind,
  isTaxIdKind,
  isValidTaxId,
  isValidUaIban,
  isValidVatId,
  normalizeIban,
} from "./ua-requisites";

/** Requisite keys as the backend names them in `fields`/`warnings`, e.g. `seller.iban`. */
export type RequisiteGaps = { fields: string[]; warnings: string[] };

export type BuyerRequisites = Pick<
  Recipient,
  "legal_name" | "tax_id" | "tax_id_kind"
>;

const filled = (value: string | null | undefined): boolean =>
  (value ?? "").trim() !== "";

function hasTaxId(
  rawTaxId: string | null | undefined,
  storedKind: string | null | undefined,
): boolean {
  const taxId = (rawTaxId ?? "").trim();
  if (taxId === "") return false;
  const kind =
    isTaxIdKind(storedKind) && isValidTaxId(taxId, storedKind)
      ? storedKind
      : inferTaxIdKind(taxId);
  return kind !== null;
}

function presenceOf(
  company: CompanyInfo,
  buyer: BuyerRequisites,
  contractRef: string,
): Record<string, boolean> {
  return {
    "seller.name": filled(company.companyName),
    "seller.taxId": hasTaxId(company.companyTaxId, company.companyTaxIdKind),
    "seller.iban": isValidUaIban(normalizeIban(company.companyIban.trim())),
    "seller.bankName": filled(company.companyBankName),
    "seller.legalForm": filled(company.companyLegalForm),
    "seller.vatPayer": company.companyVatPayer !== null,
    "seller.vatId": isValidVatId((company.companyVatId ?? "").trim()),
    "seller.signatoryName": filled(company.companySignatoryName),
    "seller.signatoryPosition": filled(company.companySignatoryPosition),
    "buyer.legalName": filled(buyer.legal_name),
    "buyer.taxId": hasTaxId(buyer.tax_id, buyer.tax_id_kind),
    "details.contractRef": contractRef.trim() !== "",
  };
}

/**
 * Client-side forecast of what the server will say about a document's requisites
 * (evaluateRequisites in backend/src/modules/receipts/document-requisites.ts).
 * It lets the form warn before the request; the server stays the authority.
 */
export function forecastRequisites(
  type: GeneratableType,
  company: CompanyInfo,
  buyer: BuyerRequisites,
  contractRef = "",
): RequisiteGaps {
  const meta: DocumentTypeMeta = DOCUMENT_TYPE_META[type];
  const presence = presenceOf(company, buyer, contractRef);
  const required = [
    ...meta.requiredSeller.map((field) => `seller.${field}`),
    ...(meta.requiresVatIdForPayer && company.companyVatPayer === true
      ? ["seller.vatId"]
      : []),
  ];
  const isAbsent = (key: string) => presence[key] === false;
  return {
    fields: required.filter(isAbsent),
    warnings: meta.warnings.filter(isAbsent),
  };
}

const HIGHLIGHT_KEY = /^(seller|buyer)\.[A-Za-z]{1,32}$/;
const MAX_HIGHLIGHTED = 16;

/** The `?highlight=` list of a link, limited to well-formed requisite keys. */
export function parseHighlight(param: string | null): string[] {
  return (param ?? "")
    .split(",")
    .filter((key) => HIGHLIGHT_KEY.test(key))
    .slice(0, MAX_HIGHLIGHTED);
}

const keysWith = (keys: readonly string[], prefix: string): string[] =>
  keys.filter((key) => key.startsWith(prefix));

/** Settings link that opens the company tab with the given seller requisites marked. */
export function sellerSettingsLink(keys: readonly string[]): string {
  const seller = keysWith(keys, "seller.");
  return `/settings?tab=company&highlight=${seller.join(",")}`;
}

/** Recipients link that opens the recipient's form with the given buyer requisites marked. */
export function buyerRecipientLink(
  recipientId: string,
  keys: readonly string[],
): string {
  const buyer = keysWith(keys, "buyer.");
  return `/recipients?edit=${recipientId}&highlight=${buyer.join(",")}`;
}

/** Element id of the input that holds a requisite, so a link can scroll to it. */
export const requisiteFieldId = (key: string): string => `requisite-${key}`;
