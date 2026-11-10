import { useCallback, useEffect, useMemo, useState } from "react";
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
  type SortOrder,
} from "./useServerPagination";

export type DocumentFilters = {
  type: string;
  status: string;
  from: string;
  to: string;
};

const POLL_INTERVAL_MS = 4000;
// About three minutes of visible polling; a document stuck "processing" longer than that is a
// server problem, and polling forever would only keep hitting the API from a forgotten tab.
const MAX_POLL_ATTEMPTS = 45;
export const SORT_FIELDS: readonly DocumentSortField[] = [
  "created_at",
  "number",
  "document_type",
  "status",
];

export const DEFAULT_DOCUMENT_SORT: DocumentSort = { sortBy: "created_at", sortOrder: "DESC" };

export type DocumentSort = { sortBy: DocumentSortField; sortOrder: SortOrder };

export const isSortField = (value: string | null | undefined): value is DocumentSortField =>
  SORT_FIELDS.includes(value as DocumentSortField);

/** Ids of the rows still generating, so polling can tell "the same ones" from "a new one appeared". */
const generatingKey = (items: DocumentListItem[]): string =>
  items
    .filter((item) => item.status === "processing" || item.replacement_status === "processing")
    .map((item) => item.id)
    .sort()
    .join(",");

/** A "From" later than "To" can match nothing; the filter bar says so instead of the request. */
export const isRangeReversed = (filters: DocumentFilters): boolean =>
  Boolean(filters.from && filters.to && filters.from > filters.to);

/**
 * The documents list. It shares the "receipts" query key, so everything that already
 * invalidates ['receipts'] (void, replace, socket events) refreshes it too.
 */
export function useDocumentsList(
  columns: ColumnDef<DocumentListItem>[],
  filters: DocumentFilters,
  initialSearch: string,
  initialPage: number,
  sort: DocumentSort,
  onSortChange: (sort: DocumentSort) => void,
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
    initialPage,
    queryFn: (params) =>
      receiptsApi.getAll({
        ...params,
        ...extraParams,
        sortBy: isSortField(params.sortBy) ? params.sortBy : undefined,
      } as DocumentListParams),
    columns,
    // The sort lives in the URL (?sort=&order=) like the filters, so a reload or Back keeps it.
    sort: {
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      onChange: (sortBy, sortOrder) => {
        if (isSortField(sortBy)) onSortChange({ sortBy, sortOrder });
      },
    },
    extraParams,
    storageKeyPrefix: "documents",
    enabled: !isRangeReversed(filters),
  });

  // Generation can finish with no socket event reaching this page, so poll server state.
  // A new row starting to generate gets a fresh set of attempts, even after an earlier one used them up.
  const reversed = isRangeReversed(filters);
  const generating = generatingKey(reversed ? [] : pagination.items);
  // The generating set whose attempts ran out; the page then offers a manual refresh instead.
  const [exhaustedKey, setExhaustedKey] = useState<string | null>(null);
  const [pollRound, setPollRound] = useState(0);
  useEffect(() => {
    if (!generating) return;
    let attempts = 0;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
    };
    const intervalId = setInterval(() => {
      // A hidden tab does not need fresh rows, and its ticks do not use up the attempts.
      if (document.hidden) return;
      attempts += 1;
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(intervalId);
        setExhaustedKey(generating);
        return;
      }
      refresh();
    }, POLL_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [generating, pollRound, queryClient]);

  const hasStoppedPolling = generating !== "" && exhaustedKey === generating;
  /** Refetches now and gives the generating rows a fresh set of polling attempts. */
  const refreshGenerating = useCallback(() => {
    setExhaustedKey(null);
    setPollRound((round) => round + 1);
    void queryClient.invalidateQueries({ queryKey: ["receipts"] });
  }, [queryClient]);

  if (reversed) {
    return {
      ...pagination,
      items: [],
      total: 0,
      totalPages: 0,
      isLoading: false,
      isFetching: false,
      hasStoppedPolling: false,
      refreshGenerating,
    };
  }
  return { ...pagination, hasStoppedPolling, refreshGenerating };
}
