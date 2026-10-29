/**
 * Dashboard cache keys. The version segment changes whenever a cached payload's
 * shape changes, so entries written by an older release are never served to
 * newer code (they simply expire). v2: profit fields may be null and carry
 * cost-completeness counters.
 */
export const DASHBOARD_CACHE_VERSION = "v2";
export const DASHBOARD_CACHE_TTL_SECONDS = 300;

export function dashboardCacheKey(
  method: string,
  userId: string,
  ...args: unknown[]
): string {
  return `dashboard:${DASHBOARD_CACHE_VERSION}:${method}:${userId}:${JSON.stringify(args)}`;
}

/** Matches every version's keys for one tenant (`*` spans `:` in Redis globs). */
export function dashboardCachePattern(userId: string): string {
  return `dashboard:*:${userId}:*`;
}
