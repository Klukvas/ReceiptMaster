import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PaginatedResponse, PaginationParams } from '../lib/api';

export type SortOrder = 'ASC' | 'DESC';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  sortKey?: string;
  visible?: boolean;
  hideable?: boolean;
  render: (item: T) => React.ReactNode;
  renderCard?: (item: T) => React.ReactNode;
}

export interface UseServerPaginationOptions<T> {
  queryKey: string;
  queryFn: (params: PaginationParams) => Promise<{ data: PaginatedResponse<T> }>;
  columns: ColumnDef<T>[];
  defaultSortBy?: string;
  defaultSortOrder?: SortOrder;
  defaultItemsPerPage?: number;
  extraParams?: Record<string, string>;
  debounceMs?: number;
  storageKeyPrefix?: string;
  /** Search text to start with, e.g. from a deep link. */
  initialSearch?: string;
  /** Page to start on, e.g. from a deep link (1-based). */
  initialPage?: number;
  /** False holds the request back (e.g. while the filters cannot match anything). */
  enabled?: boolean;
  /** A sort owned by the caller (e.g. kept in the URL) instead of internal state. */
  sort?: {
    sortBy: string;
    sortOrder: SortOrder;
    onChange: (sortBy: string, sortOrder: SortOrder) => void;
  };
}

export function useServerPagination<T>(options: UseServerPaginationOptions<T>) {
  const {
    queryKey,
    queryFn,
    columns: initialColumns,
    defaultSortBy = 'created_at',
    defaultSortOrder = 'DESC',
    defaultItemsPerPage = 10,
    extraParams = {},
    debounceMs = 400,
    storageKeyPrefix,
    initialSearch = '',
    initialPage = 1,
    enabled = true,
    sort: controlledSort,
  } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    if (storageKeyPrefix) {
      const saved = localStorage.getItem(`${storageKeyPrefix}_itemsPerPage`);
      return saved ? Number(saved) : defaultItemsPerPage;
    }
    return defaultItemsPerPage;
  });
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [ownSortBy, setOwnSortBy] = useState<string | null>(defaultSortBy);
  const [ownSortOrder, setOwnSortOrder] = useState<SortOrder>(defaultSortOrder);
  const sortBy = controlledSort ? controlledSort.sortBy : ownSortBy;
  const sortOrder = controlledSort ? controlledSort.sortOrder : ownSortOrder;
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (storageKeyPrefix) {
      const saved = localStorage.getItem(`${storageKeyPrefix}_columns`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore invalid JSON
        }
      }
    }
    return Object.fromEntries(
      initialColumns.map((col) => [col.key, col.visible !== false])
    );
  });

  // Debounce search. The page goes back to 1 only when the text really changed, so a deep link
  // to page 3 is not thrown to page 1 by the first debounce tick.
  const settledSearch = useRef(initialSearch);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      if (searchQuery !== settledSearch.current) {
        settledSearch.current = searchQuery;
        setCurrentPage(1);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [searchQuery, debounceMs]);

  // Persist itemsPerPage
  useEffect(() => {
    if (storageKeyPrefix) {
      localStorage.setItem(`${storageKeyPrefix}_itemsPerPage`, itemsPerPage.toString());
    }
  }, [itemsPerPage, storageKeyPrefix]);

  // Persist column visibility
  useEffect(() => {
    if (storageKeyPrefix) {
      localStorage.setItem(`${storageKeyPrefix}_columns`, JSON.stringify(columnVisibility));
    }
  }, [columnVisibility, storageKeyPrefix]);

  // Build query params
  const offset = (currentPage - 1) * itemsPerPage;

  const queryParams: PaginationParams = useMemo(() => ({
    limit: itemsPerPage,
    offset,
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    ...(sortBy ? { sortBy, sortOrder } : {}),
  }), [itemsPerPage, offset, debouncedSearch, sortBy, sortOrder]);

  const fullParams = useMemo(
    () => ({ ...queryParams, ...extraParams }),
    [queryParams, extraParams]
  );

  const queryResult = useQuery({
    queryKey: [queryKey, fullParams],
    queryFn: () => queryFn(fullParams),
    enabled,
    placeholderData: (previousData: { data: PaginatedResponse<T> } | undefined) => previousData,
  });

  const responseData = queryResult.data?.data;
  const items = responseData?.data ?? [];
  const total = responseData?.total ?? 0;
  const totalPages = Math.ceil(total / itemsPerPage);

  // Clamp currentPage if it exceeds totalPages
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleSort = useCallback((columnKey: string) => {
    const col = initialColumns.find((c) => c.key === columnKey);
    if (!col?.sortable) return;

    const actualSortKey = col.sortKey || col.key;
    const nextOrder: SortOrder =
      sortBy === actualSortKey ? (sortOrder === 'ASC' ? 'DESC' : 'ASC') : 'ASC';
    if (controlledSort) {
      controlledSort.onChange(actualSortKey, nextOrder);
    } else {
      setOwnSortBy(actualSortKey);
      setOwnSortOrder(nextOrder);
    }
    setCurrentPage(1);
  }, [initialColumns, sortBy, sortOrder, controlledSort]);

  const toggleColumnVisibility = useCallback((columnKey: string) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  }, []);

  const handleSetItemsPerPage = useCallback((size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  }, []);

  const columns = useMemo(() =>
    initialColumns.map((col) => ({
      ...col,
      visible: columnVisibility[col.key] !== false,
    })),
    [initialColumns, columnVisibility]
  );

  const visibleColumns = useMemo(() =>
    columns.filter((col) => col.visible),
    [columns]
  );

  return {
    items,
    total,
    isLoading: queryResult.isLoading,
    isFetching: queryResult.isFetching,
    /** True while the rows on screen belong to the previous query (page, sort or filter just changed). */
    isShowingPreviousQuery: queryResult.isPlaceholderData,
    isSearchPending: searchQuery.trim() !== debouncedSearch.trim(),
    error: queryResult.error,
    currentPage,
    totalPages,
    itemsPerPage,
    setCurrentPage,
    setItemsPerPage: handleSetItemsPerPage,
    searchQuery,
    setSearchQuery,
    sortBy,
    sortOrder,
    handleSort,
    columns,
    visibleColumns,
    toggleColumnVisibility,
    queryResult,
  };
}
