import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import {
  productsApi,
  recipientsApi,
  type PaginatedResponse,
  type PaginationParams,
} from "../lib/api";

const PAGE_SIZE = 25;

/** List pages and selected records use distinct cache keys; table caches stay untouched. */
function useEntityOptions<T extends { id: string }>(
  entity: string,
  api: {
    getAll: (
      params?: PaginationParams,
    ) => Promise<{ data: PaginatedResponse<T> }>;
    getById: (id: string) => Promise<{ data: T }>;
  },
  selectedIds: string[],
) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useInfiniteQuery({
    queryKey: [entity, "order-options", debouncedSearch],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.getAll({
        limit: PAGE_SIZE,
        offset: pageParam,
        search: debouncedSearch || undefined,
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce(
        (count, page) => count + page.data.data.length,
        0,
      );
      return lastPage.data.data.length > 0 && loaded < lastPage.data.total
        ? loaded
        : undefined;
    },
  });
  const pageItems = list.data?.pages.flatMap((page) => page.data.data) ?? [];
  const selected = useQueries({
    queries: [...new Set(selectedIds.filter(Boolean))].map((id) => ({
      queryKey: [entity, "order-option", id],
      queryFn: () => api.getById(id),
      // A visible page already carries the complete record.
      initialData: () => {
        const item = pageItems.find((option) => option.id === id);
        return item ? { data: item } : undefined;
      },
    })),
  });
  const selectedItems = selected.flatMap((result) =>
    result.data ? [result.data.data] : [],
  );
  const records = [
    ...new Map(
      [...pageItems, ...selectedItems].map((item) => [item.id, item]),
    ).values(),
  ];
  const isSearching = search.trim() !== debouncedSearch || list.isFetching;
  return {
    records,
    options: isSearching ? [] : pageItems,
    search,
    setSearch,
    isSearching,
    hasNextPage: list.hasNextPage,
    loadMore: () => {
      if (!isSearching) void list.fetchNextPage();
    },
    error: list.error ?? selected.find((result) => result.error)?.error,
    isHydrating: selected.some((result) => result.isPending),
  };
}

export const useOrderProducts = (selectedIds: string[] = []) =>
  useEntityOptions("products", productsApi, selectedIds);
export const useOrderRecipients = (selectedIds: string[] = []) =>
  useEntityOptions("recipients", recipientsApi, selectedIds);
