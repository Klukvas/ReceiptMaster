import { useEffect, useState } from "react";

/**
 * True once `isActive` has stayed true for `ms`; false again as soon as it ends.
 * Keeps a fast load from flashing a skeleton or overlay.
 */
export function useDelayedFlag(isActive: boolean, ms: number): boolean {
  const [isElapsed, setIsElapsed] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setIsElapsed(false);
      return;
    }
    const timer = setTimeout(() => setIsElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [isActive, ms]);

  return isActive && isElapsed;
}
