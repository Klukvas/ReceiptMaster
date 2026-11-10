import { dateLocale } from "./api";

/**
 * Joins design names into one phrase in the interface language ("A, B and C" / "A, B or C").
 * Each name is quoted the way the language quotes a title (`quote` wraps it). The locale is the
 * one dates use, so English reads en-GB (no serial comma), like the rest of the interface.
 */
export function formatStyleList(
  names: readonly string[],
  kind: "conjunction" | "disjunction",
  quote: (name: string) => string,
): string {
  return new Intl.ListFormat(dateLocale(), { style: "long", type: kind }).format(names.map(quote));
}
