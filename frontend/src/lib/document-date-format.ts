import { dateLocale } from "./api";

/**
 * A document's moment for lists and cards: a named month ("8 нояб. 2026 г.", "8 Nov 2026"), so
 * 03/04 is never read as March or April, and minutes only, since seconds say nothing about an issue date.
 * `timeZone` is the document zone, so the day matches the one the filters count.
 */
export const formatDocumentDateTime = (iso: string, timeZone?: string): string =>
  new Date(iso).toLocaleString(dateLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  });
