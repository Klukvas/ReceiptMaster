import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { Order, Receipt } from "../../lib/api";
import {
  canCreate,
  CREATABLE_TYPES,
  DOCUMENT_TYPE_META,
  currentDocumentsOf,
  voidedDocumentsOf,
  type CreatableType,
} from "../../lib/document-types";
import { useInFlightIds } from "../../hooks/useInFlightIds";
import { useTranslation } from "../../hooks/useTranslation";
import { receiptService } from "../../services/ReceiptService";
import { Button } from "../ui/Button";
import { CreateDocumentModal } from "./CreateDocumentModal";
import { CustomizeDocumentModal } from "./CustomizeDocumentModal";
import { DocumentCard } from "./DocumentCard";
import { VoidedDocumentHistory } from "./VoidedDocumentHistory";
import { VoidDocumentModal } from "./VoidDocumentModal";

type OrderDocumentsProps = {
  order: Order;
  onDownload: (documentId: string) => void;
  onPrint: (documentId: string) => void;
  onShare: (documentId: string) => void;
};

/** Every document of the order with its own actions, plus entries to create the missing ones. */
export function OrderDocuments({ order, onDownload, onPrint, onShare }: OrderDocumentsProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState<CreatableType | null>(null);
  const [replacing, setReplacing] = useState<Receipt | null>(null);
  const [voiding, setVoiding] = useState<Receipt | null>(null);
  const queryClient = useQueryClient();

  const { inFlightIds: retryingIds, runOnce } = useInFlightIds();
  const retry = (document: Receipt) =>
    runOnce(document.id, async () => {
      await receiptService.retryDocumentWithFeedback(order.id, document.document_type);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
    });

  const documents = currentDocumentsOf(order);
  const creatable = CREATABLE_TYPES.filter((type) => canCreate(order, type));
  if (documents.length === 0 && creatable.length === 0) return null;

  return (
    <section aria-labelledby="order-documents-heading" className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="order-documents-heading" tabIndex={-1} className="text-[11px] outline-none font-semibold uppercase tracking-wider text-content-tertiary">
          {t("documents.sectionTitle")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {creatable.map((type) => (
            <Button key={type} size="sm" variant="outline" onClick={() => setCreating(type)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t("documents.addButton", { type: t(DOCUMENT_TYPE_META[type].labelKey) })}
            </Button>
          ))}
        </div>
      </div>
      {documents.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              isRetrying={retryingIds.has(document.id)}
              actions={{ onDownload, onPrint, onShare, onReplace: setReplacing, onVoid: setVoiding, onRetry: (document) => void retry(document) }}
              footer={
                <VoidedDocumentHistory
                  documents={voidedDocumentsOf(order, document.document_type)}
                  onDownload={onDownload}
                />
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-content-tertiary">{t("documents.empty")}</p>
      )}
      {creating && <CreateDocumentModal order={order} type={creating} onClose={() => setCreating(null)} />}
      {replacing && <CustomizeDocumentModal order={order} document={replacing} onClose={() => setReplacing(null)} />}
      {voiding && (
        <VoidDocumentModal
          document={voiding}
          focusFallbackId="order-documents-heading"
          onClose={() => setVoiding(null)}
        />
      )}
    </section>
  );
}
