import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Check,
  X,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { clsx } from "clsx";
import { useReceiptSocket } from "../../hooks/useReceiptSocket";
import { receiptService } from "../../services/ReceiptService";
import { useTranslation } from "../../hooks/useTranslation";
import type {
  ReceiptProgressPayload,
  ReceiptCompletedPayload,
  ReceiptFailedPayload,
} from "../../hooks/useReceiptSocket";

interface ReceiptProgress {
  receiptId: string;
  orderId: string;
  progress: number;
  stage: string;
  status: "processing" | "completed" | "failed";
  receiptNumber?: string;
  error?: string;
  /** When this card last heard anything about its receipt. */
  updatedAt: number;
  /**
   * Bumped whenever an event changes what the card shows. A retry reuses the
   * receipt id, so the id alone cannot tell one attempt from the next: work
   * scheduled against an older revision must not act on the newer card.
   */
  revision: number;
}

const STAGE_LABELS: Record<string, string> = {
  loading_order: "receipts.stageLoadingOrder",
  loading_settings: "receipts.stageLoadingSettings",
  generating_pdf: "receipts.stageGeneratingPdf",
  computing_hash: "receipts.stageComputingHash",
  saving: "receipts.stageSaving",
  completed: "receipts.stageCompleted",
};

const COMPLETED_DISMISS_MS = 5000;
// A failure is actionable (Retry) and the user needs time to read the error.
const FAILED_DISMISS_MS = 20000;
// Silence longer than this means an event was probably lost — go ask the server.
const STALE_AFTER_MS = 8000;
const WATCHDOG_INTERVAL_MS = 2000;
// Give up on a card we cannot get an answer about rather than spinning forever.
const MAX_LOOKUP_FAILURES = 3;

type ReceiptMap = Map<string, ReceiptProgress>;

type MarkCompleted = (
  receiptId: string,
  orderId: string,
  receiptNumber?: string,
) => void;
type MarkFailed = (receiptId: string, orderId: string, error: string) => void;

/**
 * Resolves cards that stopped hearing from the socket.
 *
 * `receipt.completed` is the only thing that ends a card's spinner, so a lost or
 * undelivered event used to leave it generating until the page was reloaded.
 * Once a card has been silent for a while this asks the API what actually
 * happened — per receipt id, so a sibling order that really is still generating
 * is never touched.
 */
const useStaleReceiptWatchdog = (
  receipts: ReceiptMap,
  markCompleted: MarkCompleted,
  markFailed: MarkFailed,
  setReceipts: Dispatch<SetStateAction<ReceiptMap>>,
) => {
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;
  const pending = useRef<Set<string>>(new Set());
  const lookupFailures = useRef<Map<string, number>>(new Map());

  const isAnyProcessing = Array.from(receipts.values()).some(
    (receipt) => receipt.status === "processing",
  );

  // A failure tally only describes the attempt that produced it. Once a card
  // stops processing — finished, dismissed, or retried — the tally must not
  // carry over into whatever comes next under the same receipt id.
  useEffect(() => {
    for (const receiptId of lookupFailures.current.keys()) {
      if (receipts.get(receiptId)?.status !== "processing") {
        lookupFailures.current.delete(receiptId);
      }
    }
  }, [receipts]);

  useEffect(() => {
    if (!isAnyProcessing) return;

    const touch = (receiptId: string) =>
      setReceipts((prev) => {
        const current = prev.get(receiptId);
        if (!current || current.status !== "processing") return prev;
        const next = new Map(prev);
        next.set(receiptId, { ...current, updatedAt: Date.now() });
        return next;
      });

    const drop = (receiptId: string) => {
      lookupFailures.current.delete(receiptId);
      setReceipts((prev) => {
        if (!prev.has(receiptId)) return prev;
        const next = new Map(prev);
        next.delete(receiptId);
        return next;
      });
    };

    const reconcile = async (card: ReceiptProgress) => {
      const receipt = await receiptService
        .fetchReceipt(card.receiptId)
        .finally(() => pending.current.delete(card.receiptId));

      // A socket event may have landed while the request was in flight — either
      // resolving this card or starting a fresh attempt under the same receipt
      // id. Either way the event wins and this lookup's tally is obsolete.
      const current = receiptsRef.current.get(card.receiptId);
      if (
        current?.status !== "processing" ||
        current.revision !== card.revision
      ) {
        lookupFailures.current.delete(card.receiptId);
        return;
      }

      if (!receipt) {
        const failures = (lookupFailures.current.get(card.receiptId) ?? 0) + 1;
        lookupFailures.current.set(card.receiptId, failures);
        if (failures >= MAX_LOOKUP_FAILURES) drop(card.receiptId);
        else touch(card.receiptId);
        return;
      }

      lookupFailures.current.delete(card.receiptId);
      if (receipt.status === "generated") {
        markCompleted(card.receiptId, card.orderId, receipt.number);
      } else if (receipt.status === "failed") {
        markFailed(card.receiptId, card.orderId, receipt.error_message ?? "");
      } else if (receipt.status === "processing") {
        touch(card.receiptId); // genuinely still working — wait another round
      } else {
        drop(card.receiptId); // voided: nothing is generating any more
      }
    };

    const intervalId = setInterval(() => {
      const now = Date.now();
      for (const card of receiptsRef.current.values()) {
        if (card.status !== "processing") continue;
        if (now - card.updatedAt < STALE_AFTER_MS) continue;
        if (pending.current.has(card.receiptId)) continue;
        pending.current.add(card.receiptId);
        void reconcile(card);
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isAnyProcessing, markCompleted, markFailed, setReceipts]);
};

export const ReceiptProgressPanel = () => {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<Map<string, ReceiptProgress>>(
    new Map(),
  );

  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const lastRevision = useRef(0);

  const nextRevision = useCallback(() => {
    lastRevision.current += 1;
    return lastRevision.current;
  }, []);

  const cancelDismiss = useCallback((receiptId: string) => {
    const timer = dismissTimers.current.get(receiptId);
    if (timer === undefined) return;
    clearTimeout(timer);
    dismissTimers.current.delete(receiptId);
  }, []);

  /**
   * Auto-dismisses a finished card — but only while it is still the card that
   * was scheduled. A retry reuses the receipt id, so without the revision guard
   * a failed card's 20s timer would delete the retry's fresh progress card.
   */
  const dismissLater = useCallback(
    (receiptId: string, revision: number, delayMs: number) => {
      cancelDismiss(receiptId);
      const timer = setTimeout(() => {
        dismissTimers.current.delete(receiptId);
        setReceipts((prev) => {
          if (prev.get(receiptId)?.revision !== revision) return prev;
          const next = new Map(prev);
          next.delete(receiptId);
          return next;
        });
      }, delayMs);
      dismissTimers.current.set(receiptId, timer);
    },
    [cancelDismiss],
  );

  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const markCompleted = useCallback(
    (receiptId: string, orderId: string, receiptNumber?: string) => {
      const revision = nextRevision();
      setReceipts((prev) => {
        const next = new Map(prev);
        next.set(receiptId, {
          receiptId,
          orderId,
          progress: 100,
          stage: "completed",
          status: "completed",
          receiptNumber,
          updatedAt: Date.now(),
          revision,
        });
        return next;
      });
      dismissLater(receiptId, revision, COMPLETED_DISMISS_MS);
    },
    [dismissLater, nextRevision],
  );

  const markFailed = useCallback(
    (receiptId: string, orderId: string, error: string) => {
      const revision = nextRevision();
      setReceipts((prev) => {
        const next = new Map(prev);
        next.set(receiptId, {
          receiptId,
          orderId,
          progress: 0,
          stage: "failed",
          status: "failed",
          error,
          updatedAt: Date.now(),
          revision,
        });
        return next;
      });
      dismissLater(receiptId, revision, FAILED_DISMISS_MS);
    },
    [dismissLater, nextRevision],
  );

  const handleProgress = useCallback(
    (payload: ReceiptProgressPayload) => {
      // Fresh news about this receipt: whatever the previous attempt scheduled
      // for the same id must not outlive it.
      cancelDismiss(payload.receiptId);
      const revision = nextRevision();
      setReceipts((prev) => {
        const next = new Map(prev);
        next.set(payload.receiptId, {
          ...payload,
          status: "processing",
          updatedAt: Date.now(),
          revision,
        });
        return next;
      });
    },
    [cancelDismiss, nextRevision],
  );

  const handleCompleted = useCallback(
    (payload: ReceiptCompletedPayload) => {
      markCompleted(payload.receiptId, payload.orderId, payload.receiptNumber);
    },
    [markCompleted],
  );

  const handleFailed = useCallback(
    (payload: ReceiptFailedPayload) => {
      markFailed(payload.receiptId, payload.orderId, payload.error);
    },
    [markFailed],
  );

  useReceiptSocket({
    onProgress: handleProgress,
    onCompleted: handleCompleted,
    onFailed: handleFailed,
  });

  useStaleReceiptWatchdog(receipts, markCompleted, markFailed, setReceipts);

  const dismissReceipt = (receiptId: string) => {
    cancelDismiss(receiptId);
    setReceipts((prev) => {
      const next = new Map(prev);
      next.delete(receiptId);
      return next;
    });
  };

  const handleRetry = (orderId: string, receiptId: string) => {
    receiptService.generateReceipt(orderId);
    dismissReceipt(receiptId);
  };

  if (receipts.size === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      {Array.from(receipts.values()).map((receipt) => (
        <div
          key={receipt.receiptId}
          className={clsx(
            "pointer-events-auto rounded-xl shadow-lg border backdrop-blur-sm p-4 transition-all duration-300 animate-in slide-in-from-bottom-2",
            receipt.status === "processing" &&
              "bg-elevated/95 border-[var(--color-accent-light)]",
            receipt.status === "completed" &&
              "bg-elevated/95 border-[var(--color-success-light)]",
            receipt.status === "failed" &&
              "bg-elevated/95 border-[var(--color-danger-light)]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {receipt.status === "processing" && (
                <Loader2 className="w-4 h-4 text-accent-base animate-spin shrink-0" />
              )}
              {receipt.status === "completed" && (
                <Check className="w-4 h-4 text-success-base shrink-0" />
              )}
              {receipt.status === "failed" && (
                <AlertCircle className="w-4 h-4 text-danger-base shrink-0" />
              )}
              <span className="text-sm font-medium text-content truncate">
                {receipt.status === "completed" && receipt.receiptNumber
                  ? `${t("receipts.receiptReady")} #${receipt.receiptNumber}`
                  : receipt.status === "failed"
                    ? t("receipts.receiptFailed")
                    : t("receipts.generatingReceipt")}
              </span>
            </div>
            <button
              onClick={() => dismissReceipt(receipt.receiptId)}
              className="text-content-tertiary hover:text-content-secondary transition-colors shrink-0 ml-2 p-1.5 -m-1.5"
              aria-label={t("common.close", "Close")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Progress bar */}
          {receipt.status === "processing" && (
            <div className="w-full bg-surface-alt rounded-full h-1.5 mb-2 overflow-hidden">
              <div
                className="bg-accent-base h-1.5 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${receipt.progress}%` }}
              />
            </div>
          )}

          {/* Status text and actions */}
          <div className="flex items-center justify-between">
            {receipt.status === "processing" && (
              <span className="text-xs text-content-tertiary">
                {receipt.stage && STAGE_LABELS[receipt.stage]
                  ? t(STAGE_LABELS[receipt.stage])
                  : `${receipt.progress}%`}
              </span>
            )}
            {receipt.status === "completed" && (
              <button
                onClick={() =>
                  receiptService.downloadReceipt(receipt.receiptId)
                }
                className="text-xs text-accent-base hover:text-accent-base font-medium flex items-center gap-1 transition-colors"
              >
                <Download className="w-3 h-3" />
                {t("receipts.downloadReceipt")}
              </button>
            )}
            {receipt.status === "failed" && (
              <>
                <span className="text-xs text-danger-base truncate min-w-0 flex-1">
                  {receipt.error || t("receipts.receiptFailed")}
                </span>
                <button
                  onClick={() =>
                    handleRetry(receipt.orderId, receipt.receiptId)
                  }
                  className="text-xs text-accent-base hover:text-accent-base font-medium flex items-center gap-1 transition-colors shrink-0 ml-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  {t("receipts.retryGeneration")}
                </button>
              </>
            )}

            {receipt.status === "processing" && (
              <span className="text-xs font-medium text-accent-base">
                {receipt.progress}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
