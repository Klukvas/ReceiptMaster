/**
 * Wraps user text for an ILIKE "contains" search. `%`, `_` and `\` are LIKE wildcards or
 * the escape character, so they are escaped; otherwise searching for "%" matches everything.
 */
export function containsPattern(text: string): string {
  const escaped = text.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
