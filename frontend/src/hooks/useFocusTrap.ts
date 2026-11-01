import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusableWithin = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null,
  );

/**
 * Keyboard behaviour of a modal dialog for overlays that are not built on `Dialog`:
 * move focus inside on open, keep Tab within the container, close on Escape and
 * give focus back to whatever opened it.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void,
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);

  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || container.contains(document.activeElement)) return;
      (focusableWithin(container)[0] ?? container).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (event.key === "Escape") {
        // An inner control (e.g. an open dropdown) may have already used the key.
        if (!event.defaultPrevented) onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const isOutside = !container.contains(current);

      if (event.shiftKey && (current === first || isOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || isOutside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [active]);

  return containerRef;
}
