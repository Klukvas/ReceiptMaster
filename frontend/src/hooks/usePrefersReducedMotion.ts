import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const matchesReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(QUERY).matches;

/** Lets JS-driven animations (chart series) honour the OS reduced-motion setting. */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    matchesReducedMotion,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return prefersReducedMotion;
}
