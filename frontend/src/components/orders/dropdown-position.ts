import type { CSSProperties } from "react";

/**
 * Geometry for a `position: fixed` popup anchored under (or over) a field.
 *
 * The product selector renders its list in a portal so the modal cannot clip
 * it — which also means nothing else keeps it on screen. On a phone the space
 * under the field is often smaller than the list, and it shrinks again when the
 * on-screen keyboard opens, so the popup has to be clamped, capped and flipped
 * explicitly.
 */

const GAP = 6; // breathing room between the field and the popup
const EDGE_MARGIN = 8; // never touch the viewport edge
const PREFERRED_MAX_HEIGHT = 224; // the roomy desktop size (Tailwind max-h-56)
const MIN_HEIGHT_BELOW = 120; // below this, flipping above reads better

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface Viewport {
  /** Width of the area the user can actually see. */
  width: number;
  /** Height of the area the user can actually see (shrinks with the keyboard). */
  height: number;
  /** Visual-viewport offsets, non-zero on iOS when the page is pinched/scrolled. */
  offsetLeft: number;
  offsetTop: number;
  /** Layout viewport height — what `position: fixed; bottom` is measured from. */
  layoutHeight: number;
}

/** Reads the visible viewport, preferring the visual viewport where available. */
export const readViewport = (): Viewport => {
  const visual = window.visualViewport;
  return {
    width: visual?.width ?? window.innerWidth,
    height: visual?.height ?? window.innerHeight,
    offsetLeft: visual?.offsetLeft ?? 0,
    offsetTop: visual?.offsetTop ?? 0,
    layoutHeight: window.innerHeight,
  };
};

/**
 * Returns fixed-position styles that keep the popup fully inside `viewport`:
 * clamped horizontally, capped in height, and flipped above the anchor when
 * there is more room there.
 */
export const computeDropdownPosition = (
  anchor: AnchorRect,
  viewport: Viewport,
): CSSProperties => {
  const visibleLeft = viewport.offsetLeft + EDGE_MARGIN;
  const visibleRight = viewport.offsetLeft + viewport.width - EDGE_MARGIN;
  const visibleTop = viewport.offsetTop + EDGE_MARGIN;
  const visibleBottom = viewport.offsetTop + viewport.height - EDGE_MARGIN;

  const width = Math.max(0, Math.min(anchor.width, visibleRight - visibleLeft));
  const left = Math.min(Math.max(anchor.left, visibleLeft), visibleRight - width);

  const spaceBelow = visibleBottom - (anchor.bottom + GAP);
  const spaceAbove = anchor.top - GAP - visibleTop;
  const openAbove = spaceBelow < MIN_HEIGHT_BELOW && spaceAbove > spaceBelow;
  const available = Math.max(0, openAbove ? spaceAbove : spaceBelow);

  const placement: CSSProperties = openAbove
    ? { bottom: viewport.layoutHeight - (anchor.top - GAP) }
    : { top: anchor.bottom + GAP };

  return {
    position: "fixed",
    left,
    width,
    maxHeight: Math.min(PREFERRED_MAX_HEIGHT, available),
    zIndex: 9999,
    ...placement,
  };
};
