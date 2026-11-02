import { useEffect } from "react";

// A shared counter instead of a captured "previous value": overlays can stack and close in
// any order, and the page may only scroll again once the last one is gone.
let lockCount = 0;
let originalOverflow = "";

const acquire = () => {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
};

const release = () => {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = originalOverflow;
};

/** Keeps the page behind an overlay from scrolling while `active` is true. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    acquire();
    return release;
  }, [active]);
}
