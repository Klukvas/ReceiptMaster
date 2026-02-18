import { useState, useEffect, useCallback, useMemo } from 'react';
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
  } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    if (storageKeyPrefix) {
      const saved = localStorage.getItem(`${storageKeyPrefix}_itemsPerPage`);
      return saved ? Number(saved) : defaultItemsPerPage;
    }
    return defaultItemsPerPage;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<string | null>(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);
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

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
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
