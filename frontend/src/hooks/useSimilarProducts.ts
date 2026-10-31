import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { productsApi, type Product } from "../lib/api";

const MIN_SEARCH_LENGTH = 2;
const MAX_SIMILAR_PRODUCTS = 10;
const SEARCH_DEBOUNCE_MS = 300;

/** Searches on the server, so the hint covers the whole catalog, not one page of it. */
export function useSimilarProducts(name: string, isEnabled: boolean): Product[] {
  const searchTerm = name.trim();
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedTerm(searchTerm),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const canSearch =
    isEnabled &&
    searchTerm.length >= MIN_SEARCH_LENGTH &&
    debouncedTerm.length >= MIN_SEARCH_LENGTH;

  const { data } = useQuery({
    queryKey: ["products", "similar", debouncedTerm],
    queryFn: () =>
      productsApi.getAll({ search: debouncedTerm, limit: MAX_SIMILAR_PRODUCTS }),
    enabled: canSearch,
    placeholderData: keepPreviousData,
  });

  return canSearch ? (data?.data.data ?? []) : [];
}
