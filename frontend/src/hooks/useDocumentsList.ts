import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  receiptsApi,
  type DocumentListItem,
  type DocumentListParams,
} from "../lib/api";
import type { DocumentSortField } from "../lib/documents-api-types";
import {
  useServerPagination,
  type ColumnDef,
} from "./useServerPagination";

export type DocumentFilters = {
  type: string;
  status: string;
  from: string;
  to: string;
};

const POLL_INTERVAL_MS = 4000;
const SORT_FIELDS: readonly DocumentSortField[] = [
  "created_at",
  "number",
  "document_type",
  "status",
];

const isSortField = (value: string | undefined): value is DocumentSortField =>
  SORT_FIELDS.includes(value as DocumentSortField);

const isGenerating = (items: DocumentListItem[]): boolean =>
  items.some(
    (item) =>
      item.status === "processing" || item.replacement_status === "processing",
  );

/**
 * The documents list. It shares the "receipts" query key, so everything that already
 * invalidates ['receipts'] (void, replace, socket events) refreshes it too.
 */
export function useDocumentsList(
  columns: ColumnDef<DocumentListItem>[],
  filters: DocumentFilters,
  initialSearch: string,
) {
  const queryClient = useQueryClient();

  const extraParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (filters.type) params.type = filters.type;
    if (filters.status) params.status = filters.status;
    if (filters.from) params.startDate = filters.from;
    if (filters.to) params.endDate = filters.to;
    return params;
  }, [filters.type, filters.status, filters.from, filters.to]);

  const pagination = useServerPagination<DocumentListItem>({
    queryKey: "receipts",
    initialSearch,
    queryFn: (params) =>
      receiptsApi.getAll({
        ...params,
        ...extraParams,
        sortBy: isSortField(params.sortBy) ? params.sortBy : undefined,
      } as DocumentListParams),
    columns,
    defaultSortBy: "created_at",
    defaultSortOrder: "DESC",
    extraParams,
    storageKeyPrefix: "documents",
  });

  // Generation can finish with no socket event reaching this page, so poll server state.
  const generating = isGenerating(pagination.items);
  useEffect(() => {
    if (!generating) return;
    const intervalId = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [generating, queryClient]);

  return pagination;
}
