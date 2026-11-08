import { useEffect, useState } from "react";

/**
 * `value` once it has stopped changing for `delayMs`. Feeds screen-reader live regions, so a
 * stream of keystrokes is announced once instead of letter by letter.
 */
export function useSettledValue<Value>(value: Value, delayMs: number): Value {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
