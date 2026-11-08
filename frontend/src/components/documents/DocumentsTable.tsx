import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import type { DocumentListItem } from "../../lib/api";
import { formatDocumentDateTime } from "../../lib/document-date-format";
import { failedNextStep } from "../../lib/document-actions";
import { documentLabelKey } from "../../lib/document-types";
import { formatOrderNumber } from "../../lib/order-number";
import { DataTable } from "../ui/DataTable";
import type { useServerPagination } from "../../hooks/useServerPagination";
import { useTranslation } from "../../hooks/useTranslation";
import { useDocumentTimeZone } from "../../hooks/useDocumentTimeZone";
import { DocumentFailureReason } from "./DocumentFailureReason";
import { DocumentRowActions } from "./DocumentRowActions";
import { DocumentStatusBadge } from "./DocumentStatusBadge";
import { ORDER_LINK_CLASS, orderSearchLink } from "./useDocumentColumns";
import { VoidedDocumentNote } from "./VoidedDocumentNote";

type Pagination = ReturnType<typeof useServerPagination<DocumentListItem>>;

type DocumentsTableProps = {
  pagination: Pagination;
  hasActiveFilters: boolean;
  onDownload: (document: DocumentListItem) => void;
  onShare: (document: DocumentListItem) => void;
  onVoid: (document: DocumentListItem) => void;
  onRetry: (document: DocumentListItem) => void;
  retryingIds: ReadonlySet<string>;
};

export function DocumentsTable({
  pagination,
  hasActiveFilters,
  onDownload,
  onShare,
  onVoid,
  onRetry,
  retryingIds,
}: DocumentsTableProps) {
  const { t } = useTranslation();
  const timeZone = useDocumentTimeZone();

  const renderActions = (document: DocumentListItem, showLabels = false) => (
    <DocumentRowActions
      document={document}
      onDownload={onDownload}
      onShare={onShare}
      onVoid={onVoid}
      onRetry={onRetry}
      retryingIds={retryingIds}
      showLabels={showLabels}
    />
  );

  const renderCard = (document: DocumentListItem) => (
    <div className="rounded-xl border border-[var(--color-border)] bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tabular-nums text-content">
            {document.number}
          </p>
          <p className="text-sm text-content-secondary">
            {t(documentLabelKey(document.document_type))}
          </p>
        </div>
        <DocumentStatusBadge
          status={document.status}
          replacementStatus={document.replacement_status}
        />
      </div>
      {document.status === "failed" && (
        <div className="mt-2">
          <DocumentFailureReason message={document.error_message} nextStepKey={failedNextStep(document)} />
        </div>
      )}
      {document.status === "void" && (
        <div className="mt-2">
          <VoidedDocumentNote
            document_type={document.document_type}
            void_reason={document.void_reason}
          />
        </div>
      )}
      <p className="mt-2 text-sm text-content-secondary">
        {document.order ? (
          <>
            <Link
              to={orderSearchLink(document.order.order_number)}
              className={`${ORDER_LINK_CLASS} tabular-nums`}
            >
              {formatOrderNumber(document.order)}
            </Link>
            {" · "}
            {document.order.recipient_name ?? "—"}
          </>
        ) : (
          "—"
        )}
      </p>
      <div className="mt-2 space-y-1 border-t border-[var(--color-border-light)] pt-2">
        <span className="block text-xs text-content-tertiary">
          {formatDocumentDateTime(document.created_at, timeZone)}
        </span>
        {renderActions(document, true)}
      </div>
    </div>
  );

  return (
    <DataTable<DocumentListItem>
      items={pagination.items}
      total={pagination.total}
      isLoading={pagination.isLoading}
      // Only a page, sort or filter change shows the loading overlay; the 4 s polling refetch of
      // a generating document must not cover the row actions or flicker aria-busy.
      isFetching={
        pagination.isFetching && (pagination.isShowingPreviousQuery || pagination.items.length === 0)
      }
      error={pagination.error}
      onRetry={() => pagination.queryResult.refetch()}
      currentPage={pagination.currentPage}
      totalPages={pagination.totalPages}
      itemsPerPage={pagination.itemsPerPage}
      onPageChange={pagination.setCurrentPage}
      onItemsPerPageChange={pagination.setItemsPerPage}
      searchQuery={pagination.searchQuery}
      onSearchChange={pagination.setSearchQuery}
      sortBy={pagination.sortBy}
      sortOrder={pagination.sortOrder}
      onSort={pagination.handleSort}
      columns={pagination.columns}
      visibleColumns={pagination.visibleColumns}
      onToggleColumn={pagination.toggleColumnVisibility}
      rowKey={(document) => document.id}
      showSearch
      showColumnToggle
      searchPlaceholder={t("documentsPage.searchPlaceholder")}
      emptyIcon={<FileText className="mx-auto mb-2 h-12 w-12 text-content-tertiary" aria-hidden />}
      emptyMessage={hasActiveFilters ? t("documentsPage.noMatches") : t("documentsPage.empty")}
      emptyAction={
        hasActiveFilters ? undefined : (
          <Link className="text-sm text-accent-base hover:underline" to="/orders">
            {t("documentsPage.goToOrders")}
          </Link>
        )
      }
      emptySearchMessage={t("documentsPage.noMatches")}
      renderActions={(document) => renderActions(document)}
      renderCard={renderCard}
      compact
    />
  );
}
