import {
  ClipboardCheck,
  FileText,
  Handshake,
  Package,
  Receipt as ReceiptIcon,
  ShoppingBag,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Order, OrderItem, Receipt } from "./api-types";

export type DocumentType = Receipt["document_type"];
export type GeneratableType =
  | "waybill"
  | "invoice"
  | "act"
  | "sales_receipt"
  | "packing_list"
  | "quote"
  | "return_note";

/** Types created through the create-document dialog (the waybill is one click). */
export type CreatableType = Exclude<GeneratableType, "waybill">;

/** Which `details` form a type asks for when it is created. */
export type DocumentDetailsKind = "invoice" | "act" | "quote" | "return_note";

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
  /** Translation key of a short note shown in the create dialog, if the type needs one. */
  createNoteKey?: string;
  /**
   * The order may carry several live documents of this type (a return note per shipment
   * back), so existing ones never block a new one and each is listed on its own.
   */
  multiplePerOrder?: boolean;
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
  quote: {
    labelKey: "documentTypes.quote",
    icon: Handshake,
    allowedOrderStatuses: ["draft", "confirmed"],
    details: "quote",
    requiredSeller: ["name"],
    requiresVatIdForPayer: true,
    warnings: ["seller.taxId", "seller.legalForm", "seller.vatPayer"],
    createNoteKey: "documents.notes.quote",
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
    requiresVatIdForPayer: true,
    warnings: ["buyer.legalName", "buyer.taxId", "details.contractRef"],
  },
  sales_receipt: {
    labelKey: "documentTypes.sales_receipt",
    icon: ShoppingBag,
    allowedOrderStatuses: ["confirmed"],
    details: null,
    requiredSeller: ["name"],
    requiresVatIdForPayer: true,
    warnings: ["seller.taxId", "seller.vatPayer"],
    createNoteKey: "documents.notes.sales_receipt",
  },
  packing_list: {
    labelKey: "documentTypes.packing_list",
    icon: Package,
    allowedOrderStatuses: ["confirmed"],
    details: null,
    requiredSeller: ["name"],
    requiresVatIdForPayer: false,
    warnings: [],
    createNoteKey: "documents.notes.packing_list",
  },
  return_note: {
    labelKey: "documentTypes.return_note",
    icon: Undo2,
    allowedOrderStatuses: ["confirmed"],
    details: "return_note",
    requiredSeller: ["name"],
    requiresVatIdForPayer: true,
    warnings: ["seller.taxId", "seller.vatPayer"],
    createNoteKey: "documents.notes.return_note",
    multiplePerOrder: true,
  },
} as const satisfies Record<GeneratableType, DocumentTypeMeta>;

export const GENERATABLE_TYPES = Object.keys(
  DOCUMENT_TYPE_META,
) as GeneratableType[];

/** Types that open the create dialog, in the order their buttons appear. */
export const CREATABLE_TYPES = GENERATABLE_TYPES.filter(
  (type): type is CreatableType => type !== "waybill",
);

/**
 * Mirror of REISSUABLE_DOCUMENT_TYPES in backend/src/modules/receipts/document-types.ts:
 * types that may be issued again, with a new number, after the previous one was voided.
 */
export const REISSUABLE_DOCUMENT_TYPES: readonly GeneratableType[] = [
  "invoice",
  "act",
  "quote",
];

export function isReissuable(type: DocumentType): boolean {
  return (REISSUABLE_DOCUMENT_TYPES as readonly DocumentType[]).includes(type);
}

export function isGeneratableType(type: DocumentType): type is GeneratableType {
  return (GENERATABLE_TYPES as readonly DocumentType[]).includes(type);
}

/** Translation key for any document type, including ones that cannot be generated yet. */
export function documentLabelKey(type: DocumentType): string {
  return isGeneratableType(type)
    ? DOCUMENT_TYPE_META[type].labelKey
    : `documentTypes.${type}`;
}

/** The part of an order line the return ledger needs. */
export type ReturnableItem = Pick<OrderItem, "id" | "qty" | "returned_qty">;

type OrderWithDocuments = Pick<Order, "status"> & {
  receipts?: Receipt[] | null;
  items?: readonly ReturnableItem[] | null;
};

export function isMultiplePerOrder(type: DocumentType): boolean {
  if (!isGeneratableType(type)) return false;
  const meta: DocumentTypeMeta = DOCUMENT_TYPE_META[type];
  return meta.multiplePerOrder === true;
}

/** Units of the line that no earlier (non-void) return note has taken back yet. */
export function remainingReturnQty(item: Pick<OrderItem, "qty" | "returned_qty">): number {
  return Math.max(0, item.qty - item.returned_qty);
}

/** Every document of the order, oldest first (the API does not order them). */
export function documentsOf(order: Pick<OrderWithDocuments, "receipts">): Receipt[] {
  return [...(order.receipts ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

const newestFirst = (a: Receipt, b: Receipt): number =>
  b.created_at.localeCompare(a.created_at);

/**
 * The document of a type the order currently stands on: the newest one that is not void,
 * else the newest void one (so a voided waybill stays "the waybill").
 */
export function documentOf(
  order: Pick<OrderWithDocuments, "receipts">,
  type: DocumentType,
): Receipt | undefined {
  const ofType = documentsOf(order)
    .filter((doc) => doc.document_type === type)
    .sort(newestFirst);
  return ofType.find((doc) => doc.status !== "void") ?? ofType[0];
}

/**
 * Void documents of a type that were superseded by the current one, newest first. Types
 * with several live documents have no "current" one, so each note is listed as it is.
 */
export function voidedDocumentsOf(
  order: Pick<OrderWithDocuments, "receipts">,
  type: DocumentType,
): Receipt[] {
  if (isMultiplePerOrder(type)) return [];
  const current = documentOf(order, type);
  return documentsOf(order)
    .filter(
      (doc) =>
        doc.document_type === type && doc.status === "void" && doc.id !== current?.id,
    )
    .sort(newestFirst);
}

/**
 * Whether no later document of the same type exists. A repeatable type (return note) keeps every
 * note in the list, so an old void one must not stand for the order once a newer note is live.
 */
export function isNewestOfType(
  order: Pick<OrderWithDocuments, "receipts">,
  document: Receipt,
): boolean {
  return !documentsOf(order).some(
    (other) =>
      other.document_type === document.document_type &&
      other.created_at.localeCompare(document.created_at) > 0,
  );
}

/** The current document of every type the order has, oldest first. */
export function currentDocumentsOf(
  order: Pick<OrderWithDocuments, "receipts">,
): Receipt[] {
  const history = new Set(
    [...new Set(documentsOf(order).map((doc) => doc.document_type))].flatMap((type) =>
      voidedDocumentsOf(order, type).map((doc) => doc.id),
    ),
  );
  return documentsOf(order).filter((doc) => !history.has(doc.id));
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
 * The quote the order's recipient may already hold: issued (or still generating), neither
 * void nor failed. A quote is a frozen copy, so editing the order does not update it.
 */
export function issuedQuoteOf(
  order: Pick<OrderWithDocuments, "receipts">,
): Receipt | undefined {
  const quote = documentOf(order, "quote");
  return activeDocument(quote) ? quote : undefined;
}

/**
 * A new document of this type may be requested: the order status allows it and the
 * order has none of that type, the current one failed, or it is void and the type is
 * reissuable (the voided row stays as history and the new one gets a new number).
 * Types that may repeat are limited by what is left to return, not by earlier documents.
 */
export function canCreate(order: OrderWithDocuments, type: GeneratableType): boolean {
  const meta: DocumentTypeMeta = DOCUMENT_TYPE_META[type];
  if (!meta.allowedOrderStatuses.includes(order.status)) return false;
  if (meta.multiplePerOrder)
    return (order.items ?? []).some((item) => remainingReturnQty(item) > 0);
  const existing = documentOf(order, type);
  return (
    !existing ||
    existing.status === "failed" ||
    (existing.status === "void" && isReissuable(type))
  );
}
