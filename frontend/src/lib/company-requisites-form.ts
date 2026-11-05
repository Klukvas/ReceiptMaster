import type { CompanyInfo, CompanyInfoUpdate } from "./api";
import { isTaxIdKind, isValidVatId, type TaxIdKind } from "./ua-requisites";

export const MAX_LEGAL_FORM_LENGTH = 64;
export const MAX_BANK_NAME_LENGTH = 200;
export const MAX_SIGNATORY_LENGTH = 255;
export const MIN_TERM_DAYS = 1;
export const MAX_TERM_DAYS = 365;

export type VatPayerChoice = "unknown" | "yes" | "no";

/** The requisites card as strings, the way the inputs hold them. */
export type RequisitesForm = {
  taxIdKind: TaxIdKind | "";
  legalForm: string;
  bankName: string;
  vatPayer: VatPayerChoice;
  vatId: string;
  signatoryName: string;
  signatoryPosition: string;
  paymentTermDays: string;
};

export type RequisitesField = keyof RequisitesForm;

/** Field → translation key of the problem. */
export type RequisitesErrors = Partial<Record<RequisitesField, string>>;

const vatChoiceOf = (value: boolean | null): VatPayerChoice =>
  value === null ? "unknown" : value ? "yes" : "no";

export function formFromCompany(company: CompanyInfo): RequisitesForm {
  return {
    taxIdKind: isTaxIdKind(company.companyTaxIdKind) ? company.companyTaxIdKind : "",
    legalForm: company.companyLegalForm ?? "",
    bankName: company.companyBankName ?? "",
    vatPayer: vatChoiceOf(company.companyVatPayer),
    vatId: company.companyVatId ?? "",
    signatoryName: company.companySignatoryName ?? "",
    signatoryPosition: company.companySignatoryPosition ?? "",
    paymentTermDays:
      company.defaultPaymentTermDays === null ? "" : String(company.defaultPaymentTermDays),
  };
}

export function validateRequisites(form: RequisitesForm): RequisitesErrors {
  const days = Number(form.paymentTermDays);
  const isDaysValid =
    form.paymentTermDays.trim() === "" ||
    (Number.isInteger(days) && days >= MIN_TERM_DAYS && days <= MAX_TERM_DAYS);
  return {
    ...(form.vatId.trim() !== "" &&
      !isValidVatId(form.vatId.trim()) && {
        vatId: "settings.requisites.errors.vatId",
      }),
    ...(!isDaysValid && {
      paymentTermDays: "settings.requisites.errors.paymentTermDays",
    }),
  };
}

const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** Only requisite keys: the document-design draft is saved (and revisioned) elsewhere. */
export function updateFromForm(form: RequisitesForm): CompanyInfoUpdate {
  return {
    companyTaxIdKind: form.taxIdKind === "" ? null : form.taxIdKind,
    companyLegalForm: orNull(form.legalForm),
    companyBankName: orNull(form.bankName),
    companyVatPayer: form.vatPayer === "unknown" ? null : form.vatPayer === "yes",
    companyVatId: orNull(form.vatId),
    companySignatoryName: orNull(form.signatoryName),
    companySignatoryPosition: orNull(form.signatoryPosition),
    defaultPaymentTermDays:
      form.paymentTermDays.trim() === "" ? null : Number(form.paymentTermDays),
  };
}

const SERVER_FIELDS: Record<string, RequisitesField> = {
  companyTaxIdKind: "taxIdKind",
  companyLegalForm: "legalForm",
  companyBankName: "bankName",
  companyVatPayer: "vatPayer",
  companyVatId: "vatId",
  companySignatoryName: "signatoryName",
  companySignatoryPosition: "signatoryPosition",
  defaultPaymentTermDays: "paymentTermDays",
};

/** The card field a server validation path (`companyVatId`) belongs to, if it is one of ours. */
export function fieldOfServerPath(path: string | null): RequisitesField | null {
  return path === null ? null : (SERVER_FIELDS[path] ?? null);
}

/** Highlight key (`seller.vatId`) of each card field. */
export const HIGHLIGHT_KEY_OF: Partial<Record<RequisitesField, string>> = {
  taxIdKind: "seller.taxId",
  legalForm: "seller.legalForm",
  bankName: "seller.bankName",
  vatPayer: "seller.vatPayer",
  vatId: "seller.vatId",
  signatoryName: "seller.signatoryName",
  signatoryPosition: "seller.signatoryPosition",
};
