import { ClipboardCheck, FileText, Receipt as ReceiptIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Order, Receipt } from "./api-types";

export type DocumentType = Receipt["document_type"];
export type GeneratableType = "waybill" | "invoice" | "act";

/** Which `details` form a type asks for when it is created. */
export type DocumentDetailsKind = "invoice" | "act";

export type DocumentTypeMeta = {
  labelKey: string;
  icon: LucideIcon;
  allowedOrderStatuses: readonly Order["status"][];
  details: DocumentDetailsKind | null;
  /** Seller requisites whose absence refuses generation (422). */
  requiredSeller: readonly string[];
  /** A VAT-paying seller must also give its VAT number (ІПН). */
  requiresVatIdForPayer: boolean;
  /** Soft requisites: generation goes ahead, the response lists what is absent. */
  warnings: readonly string[];
};

/**
 * Mirror of DOCUMENT_TYPE_SPECS in backend/src/modules/receipts/document-types.ts
 * (the frontend Docker context cannot import it). Kept in sync by
 * e2e/document-types-parity.spec.mjs.
 */
export const DOCUMENT_TYPE_META = {
  waybill: {
    labelKey: "documentTypes.waybill",
    icon: FileText,
    allowedOrderStatuses: ["confirmed"],
    details: null,
    requiredSeller: [],
    requiresVatIdForPayer: false,
    warnings: [],
  },
  invoice: {
    labelKey: "documentTypes.invoice",
    icon: ReceiptIcon,
    allowedOrderStatuses: ["confirmed"],
    details: "invoice",
    requiredSeller: ["name", "taxId", "iban"],
    requiresVatIdForPayer: true,
    warnings: [
      "seller.bankName",
      "seller.legalForm",
      "seller.vatPayer",
      "buyer.taxId",
    ],
  },
  act: {
    labelKey: "documentTypes.act",
    icon: ClipboardCheck,
    allowedOrderStatuses: ["confirmed"],
    details: "act",
    requiredSeller: ["name", "taxId", "signatoryName", "signatoryPosition"],
    requiresVatIdForPayer: false,
    warnings: ["buyer.legalName", "buyer.taxId", "details.contractRef"],
  },
} as const satisfies Record<GeneratableType, DocumentTypeMeta>;

export const GENERATABLE_TYPES = Object.keys(
  DOCUMENT_TYPE_META,
) as GeneratableType[];

export function isGeneratableType(type: DocumentType): type is GeneratableType {
  return (GENERATABLE_TYPES as readonly DocumentType[]).includes(type);
}

/** Translation key for any document type, including ones that cannot be generated yet. */
export function documentLabelKey(type: DocumentType): string {
  return isGeneratableType(type)
    ? DOCUMENT_TYPE_META[type].labelKey
    : `documentTypes.${type}`;
}

type OrderWithDocuments = Pick<Order, "status"> & {
  receipts?: Receipt[] | null;
};

/** Every document of the order, oldest first (the API does not order them). */
export function documentsOf(order: Pick<OrderWithDocuments, "receipts">): Receipt[] {
  return [...(order.receipts ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

/** The newest document of a type, whatever its status. */
export function documentOf(
  order: Pick<OrderWithDocuments, "receipts">,
  type: DocumentType,
): Receipt | undefined {
  return documentsOf(order)
    .filter((doc) => doc.document_type === type)
    .at(-1);
}

/** The order's waybill: the document the download/print/share/customize buttons act on. */
export function waybillOf(
  order: Pick<OrderWithDocuments, "receipts">,
): Receipt | undefined {
  return documentOf(order, "waybill");
}

export function activeDocument(doc: Receipt | undefined): doc is Receipt {
  return doc?.status === "generated" || doc?.status === "processing";
}

/**
 * A new document of this type may be requested: the order status allows it and the
 * order has none of that type yet. A voided one still counts: the backend keeps one
 * row per order and type (DOCUMENT_ALREADY_EXISTS), so only a failed attempt is retried.
 */
export function canCreate(order: OrderWithDocuments, type: GeneratableType): boolean {
  const meta: DocumentTypeMeta = DOCUMENT_TYPE_META[type];
  const existing = documentOf(order, type);
  return (
    meta.allowedOrderStatuses.includes(order.status) &&
    (!existing || existing.status === "failed")
  );
}
