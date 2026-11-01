// Column visibility and page size are saved per table (see useServerPagination); they belong
// to the person using the browser, so the next user of a shared browser must not inherit them.
const TABLE_PREFERENCE_SUFFIXES = ["_columns", "_itemsPerPage"] as const;

export function clearTablePreferences(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    );
    for (const key of keys) {
      if (key && TABLE_PREFERENCE_SUFFIXES.some((suffix) => key.endsWith(suffix))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be blocked (private mode); there is nothing to clear then.
  }
}
