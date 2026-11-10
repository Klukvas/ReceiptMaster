import { useEffect, useRef } from "react";

// Focus and visibilitychange both fire when the user comes back; one refresh is enough.
const DEDUPE_MS = 1000;

/**
 * Calls `onReturn` when the user comes back to this tab (window focus, or the page becoming
 * visible) while `active`. Used by dialogs that send the user to another tab to fix something.
 */
export function useOnReturnToTab(active: boolean, onReturn: () => void): void {
  const onReturnRef = useRef(onReturn);
  useEffect(() => {
    onReturnRef.current = onReturn;
  }, [onReturn]);

  useEffect(() => {
    if (!active) return;
    let lastRun = 0;
    const handle = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastRun < DEDUPE_MS) return;
      lastRun = now;
      onReturnRef.current();
    };
    window.addEventListener("focus", handle);
    document.addEventListener("visibilitychange", handle);
    return () => {
      window.removeEventListener("focus", handle);
      document.removeEventListener("visibilitychange", handle);
    };
  }, [active]);
}
