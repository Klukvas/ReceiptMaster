import { OrderStatus } from "../orders/entities/order.entity";
import { DocumentType } from "./entities/receipt.entity";

export type DocumentLanguage = "uk" | "ru" | "en";

/** Seller requisites a document can ask for, keyed as they appear in `fields`/`warnings`. */
export type SellerField =
  | "name"
  | "taxId"
  | "iban"
  | "bankName"
  | "legalForm"
  | "vatPayer"
  | "vatId"
  | "signatoryName"
  | "signatoryPosition";
export type BuyerField = "legalName" | "taxId";
export type DetailsField = "contractRef";

export type RequisiteKey =
  | `seller.${SellerField}`
  | `buyer.${BuyerField}`
  | `details.${DetailsField}`;

export type DocumentTypeSpec = {
  allowedOrderStatuses: readonly OrderStatus[];
  /** Whether issuing the document locks its order (must agree with LOCKING_DOCUMENT_TYPES). */
  locking: boolean;
  /** The document prints amounts, so a style without money columns cannot carry it. */
  requiresMoney: boolean;
  /** Hard requirements: generation is refused (422) until they are filled in. */
  requiredSeller: readonly SellerField[];
  requiredBuyer: readonly BuyerField[];
  /** A VAT-paying seller must also give its VAT number (ІПН). */
  requiresVatIdForPayer: boolean;
  /** Soft: generation goes ahead and the response/snapshot lists what is absent. */
  warnings: readonly RequisiteKey[];
  /** Fixed heading in the document language; the waybill keeps the style's own title. */
  title?: Record<DocumentLanguage, string>;
  /** How the typed document is laid out; absent for the waybill. */
  layout?: DocumentLayoutSpec;
};

export type DocumentLayoutSpec = {
  sellerRole: "supplier" | "contractor";
  buyerRole: "payer" | "customer";
  /** Prints the "payment details" block (the seller's bank requisites). */
  payment: boolean;
  /** Prints the act's "work completed in full" statement. */
  completionStatement: boolean;
  /** Reserves a signature column for the buyer. */
  buyerSignature: boolean;
  /** HTML styles that carry the document's blocks; any other style is refused. */
  allowedStyles: readonly string[];
};

/**
 * Ukrainian VAT rate in percent. Assumption: the rate is not configurable yet, so a
 * constant serves; it is frozen into each document (`FrozenDocument.vatRatePercent`)
 * so replacing an issued document never changes its amounts if this value changes.
 */
export const UA_VAT_RATE_PERCENT = 20;

const DOCUMENT_STYLES = [
  "standard",
  "classic",
  "minimal",
  "corporate",
] as const;

export type GeneratableDocumentType =
  | DocumentType.WAYBILL
  | DocumentType.INVOICE
  | DocumentType.ACT;

export const DOCUMENT_TYPE_SPECS: Record<
  GeneratableDocumentType,
  DocumentTypeSpec
> = {
  [DocumentType.WAYBILL]: {
    allowedOrderStatuses: [OrderStatus.CONFIRMED],
    locking: true,
    requiresMoney: false,
    requiredSeller: [],
    requiredBuyer: [],
    requiresVatIdForPayer: false,
    warnings: [],
  },
  [DocumentType.INVOICE]: {
    allowedOrderStatuses: [OrderStatus.CONFIRMED],
    locking: true,
    requiresMoney: true,
    requiredSeller: ["name", "taxId", "iban"],
    requiredBuyer: [],
    requiresVatIdForPayer: true,
    warnings: [
      "seller.bankName",
      "seller.legalForm",
      "seller.vatPayer",
      "buyer.taxId",
    ],
    title: {
      uk: "Рахунок на оплату",
      ru: "Счёт на оплату",
      en: "Invoice",
    },
    layout: {
      sellerRole: "supplier",
      buyerRole: "payer",
      payment: true,
      completionStatement: false,
      buyerSignature: false,
      allowedStyles: DOCUMENT_STYLES,
    },
  },
  [DocumentType.ACT]: {
    allowedOrderStatuses: [OrderStatus.CONFIRMED],
    locking: true,
    requiresMoney: true,
    requiredSeller: ["name", "taxId", "signatoryName", "signatoryPosition"],
    requiredBuyer: [],
    requiresVatIdForPayer: false,
    warnings: ["buyer.legalName", "buyer.taxId", "details.contractRef"],
    title: {
      uk: "Акт виконаних робіт (наданих послуг)",
      ru: "Акт выполненных работ (оказанных услуг)",
      en: "Act of Completed Work (Services Rendered)",
    },
    layout: {
      sellerRole: "contractor",
      buyerRole: "customer",
      payment: false,
      completionStatement: true,
      buyerSignature: true,
      allowedStyles: DOCUMENT_STYLES,
    },
  },
};

export const GENERATABLE_TYPES = Object.keys(
  DOCUMENT_TYPE_SPECS,
) as GeneratableDocumentType[];

export function isGeneratableType(
  type: DocumentType,
): type is GeneratableDocumentType {
  return (GENERATABLE_TYPES as readonly DocumentType[]).includes(type);
}

/** Specs for the types generated today; throws for a type that has none. */
export function specFor(type: DocumentType): DocumentTypeSpec {
  if (!isGeneratableType(type))
    throw new Error(`No document spec for type ${type}`);
  return DOCUMENT_TYPE_SPECS[type];
}

/** Waybill snapshots carry no `document` block; every other type does. */
export function hasDocumentBlock(type: DocumentType): boolean {
  return type !== DocumentType.WAYBILL;
}
