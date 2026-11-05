import { createHash } from "crypto";
import {
  inferTaxIdKind,
  isTaxIdKind,
  isValidUaIban,
  isValidVatId,
  isValidTaxId,
  normalizeIban,
  TaxIdKind,
} from "../../common/utils/ua-requisites.util";
import type { DocumentConfig } from "../settings/document-config";
import { DocumentType } from "./entities/receipt.entity";
import { RequisiteKey, specFor } from "./document-types";

/** Who issues the document. Not filtered by the style's visibility switches. */
export type DocumentSeller = {
  name: string;
  address: string;
  taxId: string;
  taxIdKind: TaxIdKind | null;
  iban: string;
  bankName: string;
  legalForm: string;
  vatPayer: boolean | null;
  vatId: string;
  signatoryName: string;
  signatoryPosition: string;
};

export type DocumentBuyer = {
  name: string;
  legalName: string;
  taxId: string;
  taxIdKind: TaxIdKind | null;
  iban: string;
  bankName: string;
  legalAddress: string;
};

/** Seller columns of `user_settings` that live outside `document_config`. */
export type SellerColumns = {
  companyTaxIdKind?: string | null;
  companyLegalForm?: string | null;
  companyBankName?: string | null;
  companyVatPayer?: boolean | null;
  companyVatId?: string | null;
  companySignatoryName?: string | null;
  companySignatoryPosition?: string | null;
};

export type BuyerSource = {
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  tax_id_kind?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  legal_address?: string | null;
};

export type DocumentDetailsView = { contractRef?: string };

const clean = (value: string | null | undefined): string =>
  typeof value === "string" ? value.trim() : "";

function resolveKind(
  taxId: string,
  stored: string | null | undefined,
): TaxIdKind | null {
  if (isTaxIdKind(stored) && isValidTaxId(taxId, stored)) return stored;
  return inferTaxIdKind(taxId);
}

export function buildSeller(
  company: DocumentConfig["company"],
  columns: SellerColumns,
): DocumentSeller {
  const taxId = clean(company.companyTaxId);
  return {
    name: clean(company.companyName),
    address: clean(company.companyAddress),
    taxId,
    taxIdKind: resolveKind(taxId, columns.companyTaxIdKind),
    iban: String(normalizeIban(clean(company.companyIban))),
    bankName: clean(columns.companyBankName),
    legalForm: clean(columns.companyLegalForm),
    vatPayer: columns.companyVatPayer ?? null,
    vatId: clean(columns.companyVatId),
    signatoryName: clean(columns.companySignatoryName),
    signatoryPosition: clean(columns.companySignatoryPosition),
  };
}

export function buildBuyer(recipient: BuyerSource): DocumentBuyer {
  const taxId = clean(recipient.tax_id);
  return {
    name: clean(recipient.name),
    legalName: clean(recipient.legal_name),
    taxId,
    taxIdKind: resolveKind(taxId, recipient.tax_id_kind),
    iban: clean(recipient.iban),
    bankName: clean(recipient.bank_name),
    legalAddress: clean(recipient.legal_address),
  };
}

/** Detects a change of the buyer's requisites between prepare and commit. */
export function buyerFingerprint(buyer: DocumentBuyer): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        buyer.legalName,
        buyer.taxId,
        buyer.taxIdKind,
        buyer.iban,
        buyer.bankName,
        buyer.legalAddress,
      ]),
    )
    .digest("hex");
}

export type RequisiteCheck = { missing: string[]; warnings: string[] };

function isPresent(
  key: RequisiteKey,
  seller: DocumentSeller,
  buyer: DocumentBuyer,
  details: DocumentDetailsView,
): boolean {
  switch (key) {
    case "seller.name":
      return seller.name !== "";
    case "seller.taxId":
      // A number whose kind (ЄДРПОУ / РНОКПП) cannot be told is as good as absent.
      return seller.taxId !== "" && seller.taxIdKind !== null;
    case "seller.iban":
      return isValidUaIban(seller.iban);
    case "seller.bankName":
      return seller.bankName !== "";
    case "seller.legalForm":
      return seller.legalForm !== "";
    case "seller.vatPayer":
      return seller.vatPayer !== null;
    case "seller.vatId":
      return isValidVatId(seller.vatId);
    case "seller.signatoryName":
      return seller.signatoryName !== "";
    case "seller.signatoryPosition":
      return seller.signatoryPosition !== "";
    case "buyer.legalName":
      return buyer.legalName !== "";
    case "buyer.taxId":
      return buyer.taxId !== "" && buyer.taxIdKind !== null;
    case "details.contractRef":
      return Boolean(details.contractRef);
  }
}

/**
 * Hard `missing` fields block generation; `warnings` are listed but do not. The values
 * checked are the ones the document will print: the required seller fields are checked
 * on the stored values and ignore the style's visibility switches, because the
 * requisites block prints them regardless.
 */
export function evaluateRequisites(
  type: DocumentType,
  seller: DocumentSeller,
  buyer: DocumentBuyer,
  details: DocumentDetailsView,
): RequisiteCheck {
  const spec = specFor(type);
  const required: RequisiteKey[] = [
    ...spec.requiredSeller.map((f): RequisiteKey => `seller.${f}`),
    ...spec.requiredBuyer.map((f): RequisiteKey => `buyer.${f}`),
    ...(spec.requiresVatIdForPayer && seller.vatPayer === true
      ? (["seller.vatId"] as RequisiteKey[])
      : []),
  ];
  const absent = (key: RequisiteKey) => !isPresent(key, seller, buyer, details);
  return {
    missing: required.filter(absent),
    warnings: spec.warnings.filter(absent),
  };
}
