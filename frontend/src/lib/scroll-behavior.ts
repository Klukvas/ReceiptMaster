// Smooth scrolling is a courtesy, not a requirement: honour the visitor's
// reduced-motion setting everywhere we scroll from script.
export function getScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
