const DATE_LOCALE = { en: "en-US", uk: "uk-UA" } as const;

/**
 * A post's `date` ("2026-03-10") as shown to readers. A date-only string is midnight UTC, so
 * it is formatted in UTC too: in the visitor's own zone it would read a day early west of
 * Greenwich, and differ from the prerendered page.
 */
export const formatPostDate = (date: string, lang: keyof typeof DATE_LOCALE): string =>
  new Date(date).toLocaleDateString(DATE_LOCALE[lang], {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
