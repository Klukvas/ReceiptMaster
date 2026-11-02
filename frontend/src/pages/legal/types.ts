import type { ReactNode } from "react";

/**
 * One legal document in one language.
 *
 * NOTE: the Russian and Ukrainian texts (pages/legal/*.ru.tsx, *.uk.tsx) are
 * unreviewed translations of the English originals, not lawyer-approved. The
 * English text is the source of truth; have a lawyer review the translations
 * before relying on them, and mirror every English change into both.
 */
export interface LegalContent {
  /** Page heading and the SEO title. */
  readonly title: string;
  readonly seoDescription: string;
  readonly body: ReactNode;
}

export type LegalLanguage = "en" | "ru" | "uk";

export type LegalContentByLanguage = Readonly<
  Record<LegalLanguage, LegalContent>
>;

/** The language a document is shown in; English for any other language. */
export const resolveLegalLanguage = (language: string): LegalLanguage => {
  const base = language.split("-")[0];
  return base === "ru" || base === "uk" ? base : "en";
};

export const pickLegalContent = (
  contents: LegalContentByLanguage,
  language: string,
): LegalContent => contents[resolveLegalLanguage(language)];
