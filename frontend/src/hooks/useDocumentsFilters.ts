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

const pageOrFirst = (value: string | null): number => {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
};

/** The documents filters live in the URL (?type=&status=&from=&to=&search=&page=), so a reload or a link keeps them. */
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
    (change: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(latestParams.current);
      change(next);
      latestParams.current = next;
      inFlight.current = [...inFlight.current, next.toString()];
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
        for (const key of ["type", "status", "from", "to", "search", "page"]) params.delete(key);
      }),
    [commit],
  );

  return {
    filters,
    urlSearch: searchParams.get("search") ?? "",
    urlPage: pageOrFirst(searchParams.get("page")),
    setParam,
    clearFilters,
  };
}
