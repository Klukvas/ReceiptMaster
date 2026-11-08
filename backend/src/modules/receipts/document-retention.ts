import { DocumentType } from "./entities/receipt.entity";

/**
 * How many generated documents an account keeps of each document type. Generating one more
 * retires the oldest of the same type. Counted per type so that an invoice, an act and a
 * waybill for the same order do not push each other (and their public links) out.
 */
export const DOCUMENTS_RETAINED_PER_TYPE = 10;

/**
 * Types whose rows are never evicted by the cap. Deleting an invoice or act frees its
 * one-per-order slot, so the same order could be invoiced twice under another number; a
 * return note is the record behind the quantities counted on the order lines. Their rows
 * stay (the cap is not enforced for them) so neither can be lost to the retention rule.
 */
const RETENTION_EXEMPT_TYPES: ReadonlySet<DocumentType> = new Set([
  DocumentType.INVOICE,
  DocumentType.ACT,
  DocumentType.RETURN_NOTE,
]);

export function isRetentionExempt(type: DocumentType): boolean {
  return RETENTION_EXEMPT_TYPES.has(type);
}
