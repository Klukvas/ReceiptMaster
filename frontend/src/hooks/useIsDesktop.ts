import { useSyncExternalStore } from "react";

// Tailwind `lg`: the point where the sidebar stops being an off-canvas drawer.
const QUERY = "(min-width: 1024px)";

const subscribe = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mediaQuery = window.matchMedia(QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

const getSnapshot = () =>
  typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
