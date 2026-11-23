import { receiptsApi, type Receipt } from "./api";
import { isRetentionExempt } from "./document-types";

/**
 * What the retention check found: the document the plan's cap would push out and what happens
 * to it ("delete": removed entirely; "purge": the record and number stay, the PDF and public
 * link go), or "unknown" when the check failed.
 */
export type RetentionFinding =
  | { kind: "known"; number: string; limit: number; action: "delete" | "purge" }
  | { kind: "unknown" };

/**
 * Whether issuing a document of `type` needs the user's go-ahead first: the finding to confirm, or
 * null to go ahead (also when the plan keeps everything, `limit: null`). A failed lookup must not
 * block the document, but the server may still delete the oldest one, so it asks in general terms
 * instead of not at all (unless the type is never deleted).
 */
export async function retentionFindingFor(type: Receipt["document_type"]): Promise<RetentionFinding | null> {
  try {
    const { data } = await receiptsApi.getRetention(type);
    if (!data.replaces || data.limit === null) return null;
    return {
      kind: "known",
      number: data.replaces.number,
      limit: data.limit,
      action: data.action ?? "delete",
    };
  } catch (error) {
    console.error("Retention lookup failed:", error);
    return isRetentionExempt(type) ? null : { kind: "unknown" };
  }
}
