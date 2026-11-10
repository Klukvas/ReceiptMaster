import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Receipt } from "../lib/api";
import { retentionFindingFor, type RetentionFinding } from "../lib/document-retention";
import { receiptService } from "../services/ReceiptService";
import { useInFlightIds } from "./useInFlightIds";

type RetryTarget = Pick<Receipt, "id" | "order_id" | "document_type">;
type PendingRetry = { document: RetryTarget; finding: RetentionFinding };

/**
 * "Create again" for a failed document. A capped type (waybill, sales receipt, packing list,
 * quote) runs the same retention check and confirmation as creating one from the order, because a
 * successful retry counts against the cap and may delete the oldest document.
 */
export function useDocumentRetry() {
  const queryClient = useQueryClient();
  const { inFlightIds, runOnce } = useInFlightIds();
  const [pending, setPending] = useState<PendingRetry | null>(null);

  const send = useCallback(
    async (document: RetryTarget) => {
      await receiptService.retryDocument(document.order_id, document.document_type);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
      ]);
    },
    [queryClient],
  );

  const retry = useCallback(
    (document: RetryTarget) =>
      runOnce(document.id, async () => {
        const finding = await retentionFindingFor(document.document_type);
        if (finding) {
          setPending({ document, finding });
          return;
        }
        await send(document);
      }),
    [runOnce, send],
  );

  const confirm = useCallback(() => {
    if (!pending) return;
    setPending(null);
    void runOnce(pending.document.id, () => send(pending.document));
  }, [pending, runOnce, send]);

  const dismiss = useCallback(() => setPending(null), []);

  return {
    retry,
    retryingIds: inFlightIds,
    pendingRetry: pending,
    confirmRetry: confirm,
    dismissRetry: dismiss,
  };
}
