import { useEffect, useRef, type RefObject } from "react";

const FIELD_SELECTOR = "input:not([disabled]):not([type=hidden])";

const isTouchDevice = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Focuses the first text field inside the returned container whenever `active`
 * turns on or `resetKey` changes. Skipped on touch devices so the on-screen
 * keyboard does not cover the form. Runs a frame later than the Dialog's own
 * initial focus (the close button) so this one wins.
 */
export function useFocusFirstField<T extends HTMLElement>(
  active: boolean,
  resetKey?: unknown,
): RefObject<T | null> {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active || isTouchDevice()) return;
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      const focused = document.activeElement;
      // A slow frame must not pull focus back from a field the person already moved to.
      if (
        focused instanceof HTMLElement &&
        container?.contains(focused) &&
        focused.matches(FIELD_SELECTOR)
      )
        return;
      container?.querySelector<HTMLElement>(FIELD_SELECTOR)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, resetKey]);

  return containerRef;
}
