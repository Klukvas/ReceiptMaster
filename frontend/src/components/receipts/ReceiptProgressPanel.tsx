import { useState, useCallback } from 'react';
import { Check, X, Download, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useReceiptSocket } from '../../hooks/useReceiptSocket';
import { receiptService } from '../../services/ReceiptService';
import { useTranslation } from '../../hooks/useTranslation';
import type {
  ReceiptProgressPayload,
  ReceiptCompletedPayload,
  ReceiptFailedPayload,
} from '../../hooks/useReceiptSocket';

interface ReceiptProgress {
  receiptId: string;
  orderId: string;
  progress: number;
  stage: string;
  status: 'processing' | 'completed' | 'failed';
  receiptNumber?: string;
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  loading_order: 'receipts.stageLoadingOrder',
  loading_settings: 'receipts.stageLoadingSettings',
  generating_pdf: 'receipts.stageGeneratingPdf',
  computing_hash: 'receipts.stageComputingHash',
  saving: 'receipts.stageSaving',
  completed: 'receipts.stageCompleted',
};

export const ReceiptProgressPanel = () => {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<Map<string, ReceiptProgress>>(
    new Map(),
  );

  const handleProgress = useCallback(
    (payload: ReceiptProgressPayload) => {
      setReceipts((prev) => {
        const next = new Map(prev);
        next.set(payload.receiptId, {
          ...payload,
          status: 'processing',
        });
        return next;
      });
    },
    [],
  );

  const handleCompleted = useCallback(
    (payload: ReceiptCompletedPayload) => {
      setReceipts((prev) => {
        const next = new Map(prev);
        next.set(payload.receiptId, {
          receiptId: payload.receiptId,
          orderId: payload.orderId,
          progress: 100,
          stage: 'completed',
          status: 'completed',
          receiptNumber: payload.receiptNumber,
        });
        return next;
      });
      setTimeout(() => {
        setReceipts((prev) => {
          const next = new Map(prev);
          next.delete(payload.receiptId);
          return next;
        });
      }, 5000);
    },
    [],
  );

  const handleFailed = useCallback(
    (payload: ReceiptFailedPayload) => {
      setReceipts((prev) => {
        const next = new Map(prev);
        next.set(payload.receiptId, {
          receiptId: payload.receiptId,
          orderId: payload.orderId,
          progress: 0,
          stage: 'failed',
          status: 'failed',
          error: payload.error,
        });
        return next;
      });
      setTimeout(() => {
        setReceipts((prev) => {
          const next = new Map(prev);
          next.delete(payload.receiptId);
          return next;
        });
      }, 10000);
    },
    [],
  );

  useReceiptSocket({
    onProgress: handleProgress,
    onCompleted: handleCompleted,
    onFailed: handleFailed,
  });

  const dismissReceipt = (receiptId: string) => {
    setReceipts((prev) => {
      const next = new Map(prev);
      next.delete(receiptId);
      return next;
    });
  };

  if (receipts.size === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {Array.from(receipts.values()).map((receipt) => (
        <div
          key={receipt.receiptId}
          className={clsx(
            'pointer-events-auto rounded-xl shadow-lg border backdrop-blur-sm p-4 transition-all duration-300 animate-in slide-in-from-bottom-2',
            receipt.status === 'processing' &&
              'bg-white/95 dark:bg-gray-800/95 border-blue-200 dark:border-blue-800',
            receipt.status === 'completed' &&
              'bg-white/95 dark:bg-gray-800/95 border-green-200 dark:border-green-800',
            receipt.status === 'failed' &&
              'bg-white/95 dark:bg-gray-800/95 border-red-200 dark:border-red-800',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {receipt.status === 'processing' && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
              )}
              {receipt.status === 'completed' && (
                <Check className="w-4 h-4 text-green-500 shrink-0" />
              )}
              {receipt.status === 'failed' && (
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {receipt.status === 'completed' && receipt.receiptNumber
                  ? `${t('receipts.receiptReady')} #${receipt.receiptNumber}`
                  : receipt.status === 'failed'
                    ? t('receipts.receiptFailed')
                    : t('receipts.generatingReceipt')}
              </span>
            </div>
            <button
              onClick={() => dismissReceipt(receipt.receiptId)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Progress bar */}
          {receipt.status === 'processing' && (
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-2 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${receipt.progress}%` }}
              />
            </div>
          )}

          {/* Status text and actions */}
          <div className="flex items-center justify-between">
            {receipt.status === 'processing' && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {receipt.stage && STAGE_LABELS[receipt.stage]
                  ? t(STAGE_LABELS[receipt.stage])
                  : `${receipt.progress}%`}
              </span>
            )}
            {receipt.status === 'completed' && (
              <button
                onClick={() => receiptService.downloadReceipt(receipt.receiptId)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
              >
                <Download className="w-3 h-3" />
                {t('receipts.downloadReceipt')}
              </button>
            )}
            {receipt.status === 'failed' && (
              <span className="text-xs text-red-500 dark:text-red-400 truncate">
                {receipt.error || t('receipts.receiptFailed')}
              </span>
            )}

            {receipt.status === 'processing' && (
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {receipt.progress}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
