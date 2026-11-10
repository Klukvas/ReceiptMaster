/**
 * Picks the SQL column for a client-supplied `sortBy` from an allowlist, or the fallback.
 *
 * Only the allowlist's own keys count. A plain `map[sortBy]` also finds inherited names
 * (`constructor`, `toString`, `__proto__`), which would hand a function or object to the
 * query builder and turn a harmless query parameter into a 500.
 */
export function pickSortColumn(
  allowed: Readonly<Record<string, string>>,
  sortBy: unknown,
  fallback: string,
): string {
  if (
    typeof sortBy === "string" &&
    Object.prototype.hasOwnProperty.call(allowed, sortBy) &&
    typeof allowed[sortBy] === "string"
  )
    return allowed[sortBy];
  return fallback;
}
