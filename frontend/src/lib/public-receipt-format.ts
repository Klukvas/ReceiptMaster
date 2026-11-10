import type { DocumentConfig } from "./document-config";

type Formatting = DocumentConfig["formatting"];

const NUMBER_LOCALES: Readonly<Record<string, Formatting["numberLocale"]>> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

/**
 * What the public page formats with when a document carries no formatting of its own (legacy
 * snapshots): the document language's conventions, the currency symbol and the account's
 * default document zone, so the page never shows a raw ISO date or a bare number.
 */
export const defaultFormattingFor = (language: string): Formatting => ({
  numberLocale: NUMBER_LOCALES[language] ?? "en-US",
  currencyDisplay: "symbol",
  dateLocale: "document",
  dateStyle: "medium",
  timeStyle: "none",
  hourCycle: "h23",
  timeZone: "Europe/Kyiv",
});

/** "#2026-000042" for a number without a prefix, but "РН-2026-000042" as is: a prefix needs no "#". */
export const displayDocumentNumber = (number: string): string =>
  /^\p{L}/u.test(number) ? number : `#${number}`;
