import type { DocumentConfig } from "./document-config";

type Formatting = DocumentConfig["formatting"];
type DocumentLanguage = DocumentConfig["documentLanguage"];

/** The locale a document language writes numbers and "document" dates in. */
export const LANGUAGE_LOCALES: Readonly<Record<DocumentLanguage, Formatting["numberLocale"]>> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

/** An account without a saved configuration writes numbers like this, whatever its language. */
const LEGACY_NUMBER_LOCALE: Formatting["numberLocale"] = "ru-RU";

const hourCycleFor = (language: DocumentLanguage): Formatting["hourCycle"] =>
  language === "en" ? "h12" : "h23";

/**
 * The formatting after the document language changes, by the server's rule
 * (backend `settings/document-config.ts::followDocumentLanguage`): the hour cycle and the number
 * locale follow the language unless the user chose them. A value that is what the old language
 * implies (or the legacy number locale) was never chosen; anything else is kept.
 */
export function followDocumentLanguage(
  formatting: Formatting,
  from: DocumentLanguage,
  to: DocumentLanguage,
): Formatting {
  if (from === to) return formatting;
  const isLocaleChosen =
    formatting.numberLocale !== LEGACY_NUMBER_LOCALE &&
    formatting.numberLocale !== LANGUAGE_LOCALES[from];
  const isHourCycleChosen = formatting.hourCycle !== hourCycleFor(from);
  return {
    ...formatting,
    numberLocale: isLocaleChosen ? formatting.numberLocale : LANGUAGE_LOCALES[to],
    hourCycle: isHourCycleChosen ? formatting.hourCycle : hourCycleFor(to),
  };
}
