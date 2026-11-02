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
  /** Numbers read best flush right; the cell also gets tabular figures. */
  align?: 'right';
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
  /**
   * Bump when column defaults change (a column hidden or shown by default): saved choices
   * made under an older version are then ignored once. Keys keep the `_columns` suffix so
   * clearing preferences on logout still finds them.
   */
  columnsVersion?: number;
  /** Search text to start with, e.g. from a deep link. */
  initialSearch?: string;
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
    columnsVersion = 1,
    initialSearch = '',
  } = options;
  const columnsStorageKey = storageKeyPrefix
    ? `${storageKeyPrefix}${columnsVersion > 1 ? `_v${columnsVersion}` : ''}_columns`
    : null;

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    if (storageKeyPrefix) {
      const saved = localStorage.getItem(`${storageKeyPrefix}_itemsPerPage`);
      return saved ? Number(saved) : defaultItemsPerPage;
    }
    return defaultItemsPerPage;
  });
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<string | null>(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    const defaults = Object.fromEntries(
      initialColumns.map((col) => [col.key, col.visible !== false])
    );
    if (columnsStorageKey) {
      const saved = localStorage.getItem(columnsStorageKey);
      if (saved) {
        try {
          // Defaults first so a column added after the choice was saved still appears.
          return { ...defaults, ...JSON.parse(saved) };
        } catch {
          // ignore invalid JSON
        }
      }
    }
    return defaults;
  });

  // Debounce search. The page goes back to 1 only when the applied search really changes: the
  // timer also fires once after mount, and resetting then would undo a page the user already
  // picked in the first moments.
  const appliedSearchRef = useRef(initialSearch);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      if (appliedSearchRef.current !== searchQuery) {
        appliedSearchRef.current = searchQuery;
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
    if (columnsStorageKey) {
      localStorage.setItem(columnsStorageKey, JSON.stringify(columnVisibility));
    }
  }, [columnVisibility, columnsStorageKey]);

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
    if (sortBy === actualSortKey) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(actualSortKey);
      setSortOrder('ASC');
    }
    setCurrentPage(1);
  }, [initialColumns, sortBy]);

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
    // React Query pauses (does not fail) a fetch while the browser is offline.
    isOffline: queryResult.fetchStatus === 'paused',
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
