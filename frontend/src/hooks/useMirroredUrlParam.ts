import { useEffect, useRef } from "react";

type MirroredUrlParam = {
  /** The component's own state, as the string the URL holds ("" when the param is absent). */
  value: string;
  /** What the URL holds right now. */
  urlValue: string;
  setValue: (value: string) => void;
  writeUrl: (value: string) => void;
};

// A router echo arrives within a render or two; an entry older than this was swallowed (the URL
// already held the value, or a later write replaced it) and must not mask a real outside change.
const ECHO_WINDOW_MS = 2000;

type PendingWrite = { value: string; at: number };

/**
 * Keeps a piece of state and its URL param equal in both directions. Changes the component makes
 * go to the URL; a URL change it did not make (a sidebar link, Back) is pulled into the state.
 * Router updates can land a render late, so writes still on their way are remembered and their
 * echoes are not mistaken for an outside change that would overwrite what the user is typing.
 */
export function useMirroredUrlParam({ value, urlValue, setValue, writeUrl }: MirroredUrlParam) {
  const synced = useRef(urlValue);
  const writesInFlight = useRef<PendingWrite[]>([]);

  useEffect(() => {
    if (value === synced.current) return;
    synced.current = value;
    writesInFlight.current = [...writesInFlight.current, { value, at: Date.now() }];
    writeUrl(value);
  }, [value, writeUrl]);

  useEffect(() => {
    const now = Date.now();
    const fresh = writesInFlight.current.filter((write) => now - write.at <= ECHO_WINDOW_MS);
    const echoIndex = fresh.findIndex((write) => write.value === urlValue);
    if (echoIndex !== -1) {
      writesInFlight.current = fresh.slice(echoIndex + 1);
      return;
    }
    writesInFlight.current = fresh;
    if (urlValue === synced.current) return;
    synced.current = urlValue;
    setValue(urlValue);
  }, [urlValue, setValue]);
}
