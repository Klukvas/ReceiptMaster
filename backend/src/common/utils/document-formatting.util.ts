import type { Formatting } from "../../modules/settings/document-config";
// Fallback for callers without a user's saved preferences: UTC, so the order
// date and the "generated at" stamp always share one explicit time zone.
export const DEFAULT_DOCUMENT_FORMATTING: Formatting = {
  numberLocale: "ru-RU",
  currencyDisplay: "symbol",
  dateLocale: "document",
  dateStyle: "numeric",
  timeStyle: "medium",
  hourCycle: "h23",
  timeZone: "UTC",
};
export function formatDocumentMoney(
  cents: number,
  currency: string,
  preferences: Formatting,
): string {
  if (!Number.isSafeInteger(cents) || !/^[A-Z]{3}$/.test(currency))
    throw new Error("Invalid money input");
  return new Intl.NumberFormat(preferences.numberLocale, {
    style: "currency",
    currency,
    currencyDisplay: preferences.currencyDisplay,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
export function formatDocumentDate(
  date: Date | string,
  language: string,
  preferences: Formatting,
): string {
  const locale =
    preferences.dateLocale === "document"
      ? { en: "en-US", ru: "ru-RU", uk: "uk-UA" }[language] || "en-US"
      : preferences.dateLocale;
  return new Intl.DateTimeFormat(locale, {
    ...(preferences.dateStyle === "numeric"
      ? ({
          year: "numeric",
          month: "numeric",
          day: "numeric",
          ...(preferences.timeStyle !== "none"
            ? {
                hour: "numeric",
                minute:
                  preferences.timeStyle === "short" ? "2-digit" : "numeric",
                ...(preferences.timeStyle === "medium"
                  ? { second: "numeric" }
                  : {}),
              }
            : {}),
        } as const)
      : {
          dateStyle: preferences.dateStyle,
          ...(preferences.timeStyle !== "none"
            ? { timeStyle: preferences.timeStyle }
            : {}),
        }),
    hourCycle: preferences.hourCycle,
    timeZone: preferences.timeZone,
  }).format(new Date(date));
}

// Calendar date without a clock time, in the same locale as the document's other dates
// (e.g. "15 жовтня 2026 р." for uk). A moment is shown in the document's time zone; a plain
// "YYYY-MM-DD" is already a calendar date, so it is formatted in UTC to avoid a day shift.
export function formatDocumentDateOnly(
  date: Date | string,
  language: string,
  preferences: Formatting,
): string {
  const isCalendarDate =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return formatDocumentDate(date, language, {
    ...preferences,
    dateStyle: "long",
    timeStyle: "none",
    ...(isCalendarDate ? { timeZone: "UTC" } : {}),
  });
}
