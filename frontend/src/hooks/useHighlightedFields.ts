import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parseHighlight, requisiteFieldId } from "../lib/document-requisites";

/** Class that marks a requisite field a link pointed at. */
export const HIGHLIGHT_CLASS =
  "ring-2 ring-[var(--color-warning)] border-[var(--color-warning)]";

/**
 * The requisite keys named by `?highlight=` (e.g. `seller.iban`). Once the fields are
 * rendered, the first one is scrolled to and focused so the user lands on what to fill in.
 */
export function useHighlightedFields(isReady: boolean): ReadonlySet<string> {
  const [params] = useSearchParams();
  const raw = params.get("highlight");
  const keys = useMemo(() => parseHighlight(raw), [raw]);

  useEffect(() => {
    if (!isReady || keys.length === 0) return;
    const field = document.getElementById(requisiteFieldId(keys[0]));
    field?.scrollIntoView({ block: "center" });
    field?.focus({ preventScroll: true });
  }, [isReady, keys]);

  return useMemo(() => new Set(keys), [keys]);
}
