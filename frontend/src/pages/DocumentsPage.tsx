import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { receiptService } from "../services/ReceiptService";
import type { DocumentListItem } from "../lib/api";
import { DocumentsFilterBar } from "../components/documents/DocumentsFilterBar";
import { DocumentsTable } from "../components/documents/DocumentsTable";
import { useDocumentColumns } from "../components/documents/useDocumentColumns";
import { ShareReceiptModal } from "../components/receipts/ShareReceiptModal";
import { VoidDocumentModal } from "../components/orders/VoidDocumentModal";
import { NotificationToast } from "../components/common";
import { useDocumentsFilters } from "../hooks/useDocumentsFilters";
import { useDocumentsList } from "../hooks/useDocumentsList";
import { useDocumentTimeZone } from "../hooks/useDocumentTimeZone";
import { useNotifications } from "../hooks/useNotifications";
import { useTranslation } from "../hooks/useTranslation";

export const DocumentsPage = () => {
  const { t } = useTranslation();
  const { notifications } = useNotifications();
  const queryClient = useQueryClient();
  const timeZone = useDocumentTimeZone();
  const { filters, urlSearch, initialSearch, setParam, clearFilters } = useDocumentsFilters();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<DocumentListItem | null>(null);

  const columns = useDocumentColumns();
  const pagination = useDocumentsList(columns, filters, initialSearch);
  const { searchQuery, setSearchQuery, setCurrentPage } = pagination;

  // The search text is part of the shareable view, like the other filters.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed !== urlSearch) setParam("search", trimmed);
  }, [searchQuery, urlSearch, setParam]);

  const hasActiveFilters = Object.values(filters).some(Boolean) || searchQuery.trim() !== "";

  const changeFilter = (key: keyof typeof filters, value: string) => {
    setParam(key, value);
    setCurrentPage(1);
  };

  const retry = async (document: DocumentListItem) => {
    await receiptService.retryDocument(document.order_id, document.document_type);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["receipts"] }),
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
    ]);
  };

  return (
    <div className="space-y-5">
      <NotificationToast notifications={notifications} />

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-light)]">
          <FileText className="h-5 w-5 text-accent-base" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-content">
            {t("documentsPage.title")}
          </h1>
          <p className="text-sm text-content-tertiary">{t("documentsPage.subtitle")}</p>
        </div>
      </div>

      <p className="text-xs text-content-tertiary" data-testid="documents-retention-hint">
        {t("documentsPage.retentionHint")}
      </p>

      <DocumentsFilterBar
        filters={filters}
        onChange={changeFilter}
        hasSearch={searchQuery.trim() !== ""}
        timeZone={timeZone}
        onClear={() => {
          clearFilters();
          setSearchQuery("");
          setCurrentPage(1);
        }}
      />

      <DocumentsTable
        pagination={pagination}
        hasActiveFilters={hasActiveFilters}
        onDownload={(document) => void receiptService.downloadReceipt(document.id)}
        onShare={(document) => setSharingId(document.id)}
        onVoid={setVoiding}
        onRetry={retry}
      />

      {sharingId && (
        <ShareReceiptModal
          isOpen
          onClose={() => setSharingId(null)}
          receiptId={sharingId}
        />
      )}
      {voiding && <VoidDocumentModal document={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
};
