import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { DOCUMENT_TYPE_META } from "../lib/document-types";
import type { DocumentFilters } from "./useDocumentsList";

export const DOCUMENT_STATUSES = [
  "processing",
  "generated",
  "failed",
  "void",
] as const;

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_META);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const oneOf = (value: string | null, allowed: readonly string[]): string =>
  value !== null && allowed.includes(value) ? value : "";

const dateOrEmpty = (value: string | null): string =>
  value !== null && DATE_PATTERN.test(value) ? value : "";

/** The documents filters live in the URL (?type=&status=&from=&to=&search=), so a reload or a link keeps them. */
export function useDocumentsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: DocumentFilters = useMemo(
    () => ({
      type: oneOf(searchParams.get("type"), DOCUMENT_TYPES),
      status: oneOf(searchParams.get("status"), DOCUMENT_STATUSES),
      from: dateOrEmpty(searchParams.get("from")),
      to: dateOrEmpty(searchParams.get("to")),
    }),
    [searchParams],
  );

  // Two changes in one tick (a date and a search, say) must both land, so each builds on the
  // latest params rather than on the ones of the last render.
  const latestParams = useRef(searchParams);
  useEffect(() => {
    latestParams.current = searchParams;
  }, [searchParams]);

  const commit = useCallback(
    (change: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(latestParams.current);
      change(next);
      latestParams.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  const setParam = useCallback(
    (key: string, value: string) =>
      commit((params) => {
        if (value) params.set(key, value);
        else params.delete(key);
      }),
    [commit],
  );

  const clearFilters = useCallback(
    () =>
      commit((params) => {
        for (const key of ["type", "status", "from", "to", "search"]) params.delete(key);
      }),
    [commit],
  );

  return {
    filters,
    urlSearch: searchParams.get("search") ?? "",
    initialSearch: searchParams.get("search") ?? "",
    setParam,
    clearFilters,
  };
}
