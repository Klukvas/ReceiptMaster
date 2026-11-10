import { useCallback, useEffect, useRef } from "react";

/** A caller that shows no progress never sets `isLoading`; release after a double click's span. */
const RELEASE_WITHOUT_LOADING_MS = 500;

type ConfirmLock = "idle" | "clicked" | "loading";

/**
 * Lets a confirm dialog's action run once per attempt.
 *
 * Both clicks of a double click arrive before the parent re-renders with `isLoading`, so the
 * soft-disabled button cannot stop the second one: it sent two DELETE requests. The first
 * click takes a synchronous lock; it is released when the request finishes (`isLoading` goes
 * back to false, so a failed attempt can be retried) or the dialog closes or reopens.
 */
export const useConfirmOnce = (isOpen: boolean, isLoading: boolean) => {
  const lockRef = useRef<ConfirmLock>("idle");

  useEffect(() => {
    if (isLoading) lockRef.current = "loading";
    else if (lockRef.current === "loading") lockRef.current = "idle";
  }, [isLoading]);

  useEffect(() => {
    lockRef.current = "idle";
  }, [isOpen]);

  return useCallback((onConfirm: () => void) => {
    if (lockRef.current !== "idle") return;
    lockRef.current = "clicked";
    onConfirm();
    window.setTimeout(() => {
      if (lockRef.current === "clicked") lockRef.current = "idle";
    }, RELEASE_WITHOUT_LOADING_MS);
  }, []);
};
