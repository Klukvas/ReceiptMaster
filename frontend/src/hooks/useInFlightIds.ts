import { useCallback, useRef, useState } from "react";

/**
 * Runs one task per id at a time and exposes the ids whose task is still running, so a button can
 * be disabled while its request is in flight. The ref answers a second click that lands before the
 * state has re-rendered the button.
 */
export function useInFlightIds() {
  const inFlightRef = useRef<ReadonlySet<string>>(new Set());
  const [inFlightIds, setInFlightIds] = useState<ReadonlySet<string>>(inFlightRef.current);

  const publish = useCallback((next: ReadonlySet<string>) => {
    inFlightRef.current = next;
    setInFlightIds(next);
  }, []);

  const runOnce = useCallback(
    async (id: string, task: () => Promise<void>) => {
      if (inFlightRef.current.has(id)) return;
      publish(new Set([...inFlightRef.current, id]));
      try {
        await task();
      } finally {
        publish(new Set([...inFlightRef.current].filter((runningId) => runningId !== id)));
      }
    },
    [publish],
  );

  return { inFlightIds, runOnce };
}
