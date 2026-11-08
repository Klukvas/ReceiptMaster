/**
 * Wire types for the documents list, document numbering and signature/stamp endpoints. They are
 * aliases of the generated contract (`yarn openapi:generate`); only the list query is hand-written,
 * because the generator types its `sortBy`/`type`/`status` loosely.
 */
import type { components } from "./api-types.generated";
import type { Receipt } from "./api-types";

export type DocumentType = Receipt["document_type"];
export type DocumentStatus = Receipt["status"];

/** A row of GET /receipts: the document plus the order it belongs to (null if unavailable). */
export type DocumentListItem = components["schemas"]["DocumentListItem"];

export type DocumentSortField =
  | "created_at"
  | "number"
  | "document_type"
  | "status";

export type DocumentListParams = {
  offset?: number;
  limit?: number;
  type?: DocumentType;
  status?: DocumentStatus;
  /** YYYY-MM-DD, read by the API as whole UTC days. */
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: DocumentSortField;
  sortOrder?: "ASC" | "DESC";
};

export type NumberingSetting = components["schemas"]["NumberingSetting"];
export type NumberingUpdate = components["schemas"]["NumberingUpdateRequest"];
export type SignoffImage = components["schemas"]["SignoffImage"];
export type SignoffState = components["schemas"]["SignoffState"];
export type SignoffKind = "signature" | "stamp";
