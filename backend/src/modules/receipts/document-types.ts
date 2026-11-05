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

/** Keys of the signature headings in the document labels. */
export type SignatureLabelKey =
  | "issuedBy"
  | "fromContractor"
  | "fromCustomer"
  | "sellerSignature"
  | "shippedBy"
  | "receivedBy";

export type DocumentLayoutSpec = {
  sellerRole: "supplier" | "contractor" | "seller" | "shipper";
  buyerRole: "payer" | "customer" | "buyer" | "consignee";
  /** Prints the "payment details" block (the seller's bank requisites). */
  payment: boolean;
  /** Prints the act's "work completed in full" statement. */
  completionStatement: boolean;
  /**
   * Prints prices, totals, VAT and the amount in words. When false the items table
   * drops its price columns and the document shows line count and total quantity.
   */
  money: boolean;
  /** Prints the "not a fiscal document" notice above the parties. */
  nonFiscalNotice: boolean;
  /** Which of the buyer's addresses leads: the legal one, or the delivery one. */
  buyerAddress: "legal" | "delivery";
  /** Signature columns; the buyer's is reserved only when `buyer` is set. */
  signatures: {
    seller: SignatureLabelKey;
    buyer?: SignatureLabelKey;
    /** Whether the caption asks for a seal ("Signature / Seal") next to the signature. */
    stamp: boolean;
  };
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
  | DocumentType.ACT
  | DocumentType.SALES_RECEIPT
  | DocumentType.PACKING_LIST;

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
      money: true,
      nonFiscalNotice: false,
      buyerAddress: "legal",
      signatures: { seller: "issuedBy", stamp: true },
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
      money: true,
      nonFiscalNotice: false,
      buyerAddress: "legal",
      signatures: {
        seller: "fromContractor",
        buyer: "fromCustomer",
        stamp: true,
      },
      allowedStyles: DOCUMENT_STYLES,
    },
  },
  [DocumentType.SALES_RECEIPT]: {
    allowedOrderStatuses: [OrderStatus.CONFIRMED],
    locking: true,
    requiresMoney: true,
    requiredSeller: ["name"],
    requiredBuyer: [],
    requiresVatIdForPayer: true,
    warnings: ["seller.taxId", "seller.vatPayer"],
    title: {
      uk: "Товарний чек",
      ru: "Товарный чек",
      en: "Sales Receipt",
    },
    layout: {
      sellerRole: "seller",
      buyerRole: "buyer",
      payment: false,
      completionStatement: false,
      money: true,
      nonFiscalNotice: true,
      buyerAddress: "legal",
      signatures: { seller: "sellerSignature", stamp: false },
      allowedStyles: DOCUMENT_STYLES,
    },
  },
  [DocumentType.PACKING_LIST]: {
    allowedOrderStatuses: [OrderStatus.CONFIRMED],
    locking: true,
    requiresMoney: false,
    requiredSeller: ["name"],
    requiredBuyer: [],
    requiresVatIdForPayer: false,
    warnings: [],
    title: {
      uk: "Пакувальний лист",
      ru: "Упаковочный лист",
      en: "Packing List",
    },
    layout: {
      sellerRole: "shipper",
      buyerRole: "consignee",
      payment: false,
      completionStatement: false,
      money: false,
      nonFiscalNotice: false,
      buyerAddress: "delivery",
      signatures: {
        seller: "shippedBy",
        buyer: "receivedBy",
        stamp: false,
      },
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
