import { useEffect, useState } from "react";
import { documentToday } from "../lib/document-clock";

const DAY_CHECK_INTERVAL_MS = 60_000;

/**
 * The current moment, refreshed only when the calendar day in the document time zone changes
 * (checked every minute and whenever the tab regains focus, since a sleeping tab skips timers).
 * A dialog left open across midnight then recomputes its "today" limits instead of keeping yesterday's.
 */
export function useDocumentNow(timeZone: string | undefined): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refreshIfDayChanged = () =>
      setNow((previous) => {
        const next = new Date();
        return documentToday(timeZone, next) === documentToday(timeZone, previous) ? previous : next;
      });
    const intervalId = setInterval(refreshIfDayChanged, DAY_CHECK_INTERVAL_MS);
    window.addEventListener("focus", refreshIfDayChanged);
    document.addEventListener("visibilitychange", refreshIfDayChanged);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfDayChanged);
      document.removeEventListener("visibilitychange", refreshIfDayChanged);
    };
  }, [timeZone]);

  return now;
}
