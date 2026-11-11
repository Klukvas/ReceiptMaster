/**
 * Geometry for a `position: fixed` action menu anchored to its trigger button.
 *
 * The menu's height depends on the order (status, document types) and its width on the
 * interface language, so both are measured after render and passed in here. The menu opens
 * below the trigger, flips above it when only that side has room, and otherwise is clamped
 * into the viewport; when even the whole viewport is too short it gets a max height and
 * scrolls inside.
 */

export const MENU_GAP = 4;
export const MENU_EDGE_MARGIN = 8;

export interface TriggerRect {
  top: number;
  bottom: number;
  right: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface MenuPosition {
  top: number;
  left: number;
  /** Set only when the menu is taller than the viewport and has to scroll inside. */
  maxHeight?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

const verticalPlacement = (
  trigger: TriggerRect,
  height: number,
  viewport: ViewportSize,
): Pick<MenuPosition, "top" | "maxHeight"> => {
  const usableHeight = viewport.height - 2 * MENU_EDGE_MARGIN;
  if (height > usableHeight)
    return { top: MENU_EDGE_MARGIN, maxHeight: Math.max(0, usableHeight) };

  const below = trigger.bottom + MENU_GAP;
  if (below + height <= viewport.height - MENU_EDGE_MARGIN) return { top: below };

  const above = trigger.top - MENU_GAP - height;
  if (above >= MENU_EDGE_MARGIN) return { top: above };

  // Neither side has room, but the viewport does: stay as close to the trigger as fits.
  return {
    top: clamp(below, MENU_EDGE_MARGIN, viewport.height - MENU_EDGE_MARGIN - height),
  };
};

/** The menu's right edge lines up with the trigger's, clamped to the viewport. */
export const computeMenuPosition = (
  trigger: TriggerRect,
  menu: MenuSize,
  viewport: ViewportSize,
): MenuPosition => ({
  ...verticalPlacement(trigger, menu.height, viewport),
  left: clamp(
    trigger.right - menu.width,
    MENU_EDGE_MARGIN,
    viewport.width - MENU_EDGE_MARGIN - menu.width,
  ),
});
