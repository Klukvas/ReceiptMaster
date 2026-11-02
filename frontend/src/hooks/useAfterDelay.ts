import { useEffect, useState } from "react";

/** True once `ms` have passed since mount; keeps fast loads from flashing a skeleton. */
export function useAfterDelay(ms: number): boolean {
  const [isElapsed, setIsElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);

  return isElapsed;
}
