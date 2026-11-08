import type { Receipt } from "./api-types";

type ActionSubject = Pick<Receipt, "status" | "pdf_url"> &
  Partial<Pick<Receipt, "replacement_status">>;

/** A voided document keeps its PDF when it was generated before the void. */
export const canDownloadDocument = (document: ActionSubject): boolean =>
  document.status === "generated" ||
  (document.status === "void" && Boolean(document.pdf_url));

export const canShareDocument = (document: ActionSubject): boolean =>
  document.status === "generated";

/** Only a finished document can be voided: not one that is generating, failed, or being replaced. */
export const canVoidDocument = (document: ActionSubject): boolean =>
  document.status === "generated" && document.replacement_status !== "processing";

/** A failed document can be generated again, except a return note (it needs its lines chosen anew). */
export const canRetryDocument = (
  document: ActionSubject & Pick<Receipt, "document_type">,
): boolean =>
  document.status === "failed" && document.document_type !== "return_note";
