/** Used until the account's document settings are known (or when they hold an unusable zone). */
export const DEFAULT_DOCUMENT_TIME_ZONE = "Europe/Kyiv";

function calendarDateIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The calendar day it is right now in the document time zone (`Formatting.timeZone`),
 * as YYYY-MM-DD: the same day the server takes as a document's issue date, which can
 * differ from the browser's own day near midnight.
 */
export function documentToday(
  timeZone: string | undefined,
  now: Date = new Date(),
): string {
  try {
    return calendarDateIn(timeZone || DEFAULT_DOCUMENT_TIME_ZONE, now);
  } catch {
    // An unknown zone name throws a RangeError; the server would have refused it on save.
    return calendarDateIn(DEFAULT_DOCUMENT_TIME_ZONE, now);
  }
}

/** The zone to display document dates in: the account's, or the default when unknown or unusable. */
export function resolveDocumentTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return DEFAULT_DOCUMENT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_DOCUMENT_TIME_ZONE;
  }
}
