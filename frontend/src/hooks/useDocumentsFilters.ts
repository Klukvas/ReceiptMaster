import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { DOCUMENT_TYPE_META } from "../lib/document-types";
import {
  DEFAULT_DOCUMENT_SORT,
  isSortField,
  type DocumentFilters,
  type DocumentSort,
} from "./useDocumentsList";

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

const pageOrFirst = (value: string | null): number => {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
};

/**
 * Typed text and dates change on every keystroke or picker step, so they replace the current history
 * entry; a page, type, status, sort or clear is one deliberate step, so Back returns to the list as
 * it was before it. Dropping ?page= is the reset that follows such a step (or a search), so it
 * replaces too: one filter change stays one history entry.
 */
const REPLACED_PARAMS: ReadonlySet<string> = new Set(["search", "from", "to"]);

const sortOf = (params: URLSearchParams): DocumentSort => {
  const field = params.get("sort");
  if (!isSortField(field)) return DEFAULT_DOCUMENT_SORT;
  return { sortBy: field, sortOrder: params.get("order") === "asc" ? "ASC" : "DESC" };
};

/**
 * The documents filters live in the URL (?type=&status=&from=&to=&search=&page=), so a reload or a
 * link keeps them; so does the sort (?sort=&order=, left out while it is the default).
 */
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

  // Several changes in quick succession (a status, then two dates) must all land, so each builds on
  // the latest params rather than on the ones of the last render. `inFlight` lists what we have
  // committed but the router has not rendered yet: a render of an older entry is stale and must
  // not roll the latest params back, while an unlisted value is a real navigation (Back, a link).
  const latestParams = useRef(searchParams);
  const inFlight = useRef<string[]>([]);
  useEffect(() => {
    const rendered = searchParams.toString();
    const position = inFlight.current.indexOf(rendered);
    if (position === -1) {
      inFlight.current = [];
      latestParams.current = searchParams;
      return;
    }
    inFlight.current = inFlight.current.slice(position + 1);
    if (inFlight.current.length === 0) latestParams.current = searchParams;
  }, [searchParams]);

  const commit = useCallback(
    (change: (params: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(latestParams.current);
      change(next);
      if (next.toString() === latestParams.current.toString()) return;
      latestParams.current = next;
      inFlight.current = [...inFlight.current, next.toString()];
      setSearchParams(next, { replace });
    },
    [setSearchParams],
  );

  const setParam = useCallback(
    (key: string, value: string) =>
      commit((params) => {
        if (value) params.set(key, value);
        else params.delete(key);
      }, REPLACED_PARAMS.has(key) || (key === "page" && !value)),
    [commit],
  );

  const setSort = useCallback(
    ({ sortBy, sortOrder }: DocumentSort) =>
      commit((params) => {
        const isDefault =
          sortBy === DEFAULT_DOCUMENT_SORT.sortBy && sortOrder === DEFAULT_DOCUMENT_SORT.sortOrder;
        if (isDefault) {
          params.delete("sort");
          params.delete("order");
        } else {
          params.set("sort", sortBy);
          params.set("order", sortOrder === "ASC" ? "asc" : "desc");
        }
        // A new order starts on the first page.
        params.delete("page");
      }),
    [commit],
  );

  const sort = useMemo(() => sortOf(searchParams), [searchParams]);

  const clearFilters = useCallback(
    () =>
      commit((params) => {
        for (const key of ["type", "status", "from", "to", "search", "page"]) params.delete(key);
      }),
    [commit],
  );

  return {
    filters,
    urlSearch: searchParams.get("search") ?? "",
    urlPage: pageOrFirst(searchParams.get("page")),
    sort,
    setParam,
    setSort,
    clearFilters,
  };
}
