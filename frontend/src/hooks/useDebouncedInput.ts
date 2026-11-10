import { useCallback, useEffect, useRef, useState } from "react";

/**
 * An input that shows every keystroke at once but reports it only after the user pauses (or
 * leaves the field). Typing a year into a date input passes through 0002, 0020 and 0202 on the
 * way to 2026; each of those would otherwise start a request.
 *
 * A change of `value` from outside drops the pending text and its timer. So do `cancel()` (Clear
 * filters, where the value may already be empty and so not change) and browser history navigation
 * (Back/Forward), so a half-typed date is never applied to the page the user went to.
 */
export function useDebouncedInput(
  value: string,
  onCommit: (value: string) => void,
  delayMs: number,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const [seenValue, setSeenValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Adjusting state while rendering is React's way to follow a prop without an extra pass.
  if (seenValue !== value) {
    setSeenValue(value);
    setDraft(null);
  }

  // A new outside value cancels the timer of the text it replaced; so does unmounting.
  useEffect(() => () => clearTimeout(timerRef.current), [value]);

  const change = useCallback(
    (next: string) => {
      setDraft(next);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        onCommitRef.current(next);
      }, delayMs);
    },
    [delayMs],
  );

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    setDraft(null);
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", cancel);
    return () => window.removeEventListener("popstate", cancel);
  }, [cancel]);

  const flush = useCallback(() => {
    if (timerRef.current === undefined || draft === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    if (draft !== value) onCommitRef.current(draft);
  }, [draft, value]);

  return { value: draft ?? value, change, flush, cancel };
}
