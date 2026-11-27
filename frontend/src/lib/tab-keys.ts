/** The keys that move between tabs in the ARIA tabs pattern. */
type TabNavigationKey = "ArrowRight" | "ArrowLeft" | "Home" | "End";

const STEPS: Readonly<
  Record<TabNavigationKey, (index: number, count: number) => number>
> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

const isTabNavigationKey = (key: string): key is TabNavigationKey =>
  Object.hasOwn(STEPS, key);

/**
 * The tab a key press moves to, wrapping at both ends, or null for a key that does not move
 * between tabs (the caller then leaves the event alone).
 */
export function tabAfterKey<T>(
  key: string,
  tabs: readonly T[],
  current: T,
): T | null {
  if (!isTabNavigationKey(key) || tabs.length === 0) return null;
  return tabs[STEPS[key](Math.max(tabs.indexOf(current), 0), tabs.length)];
}
