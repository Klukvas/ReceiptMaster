import { DocumentType } from "./entities/receipt.entity";

/**
 * A plan keeps a number of generated documents of each type (`documentsRetainedPerType`);
 * generating one more retires the oldest of the same type. Counted per type so that an
 * invoice, an act and a waybill for the same order do not push each other out.
 *
 * - `delete`: the row goes, with its PDF, number and public link.
 * - `purge`: only the file and the public link go; the row stays as a record.
 */
export type RetentionAction = "delete" | "purge";

/**
 * Types whose row must outlive the limit. Deleting an invoice or act would free its
 * one-per-order slot, so the same order could be invoiced twice under another number; a
 * return note is the record behind the quantities counted on the order lines.
 */
const RECORD_KEPT_TYPES: ReadonlySet<DocumentType> = new Set([
  DocumentType.INVOICE,
  DocumentType.ACT,
  DocumentType.RETURN_NOTE,
]);

export function retentionAction(type: DocumentType): RetentionAction {
  return RECORD_KEPT_TYPES.has(type) ? "purge" : "delete";
}
