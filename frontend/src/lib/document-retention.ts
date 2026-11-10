import { receiptsApi, type Receipt } from "./api";
import { isRetentionExempt } from "./document-types";

/** What the retention check found: the document the cap would delete, or "unknown" when the check failed. */
export type RetentionFinding = { kind: "known"; number: string; limit: number } | { kind: "unknown" };

/**
 * Whether issuing a document of `type` needs the user's go-ahead first: the finding to confirm, or
 * null to go ahead. A failed lookup must not block the document, but the server may still delete
 * the oldest one, so it asks in general terms instead of not at all (unless the type is never deleted).
 */
export async function retentionFindingFor(type: Receipt["document_type"]): Promise<RetentionFinding | null> {
  try {
    const { data } = await receiptsApi.getRetention(type);
    return data.replaces ? { kind: "known", number: data.replaces.number, limit: data.limit } : null;
  } catch (error) {
    console.error("Retention lookup failed:", error);
    return isRetentionExempt(type) ? null : { kind: "unknown" };
  }
}
