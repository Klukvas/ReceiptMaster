import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { computeMenuPosition, type MenuPosition } from "../lib/menu-position";

/**
 * Places an open `position: fixed` menu next to its trigger, from the menu's rendered size.
 *
 * Measuring happens in a layout effect, so the corrected position is committed before the
 * browser paints and the menu never shows up in the wrong place first.
 */
export const useMenuPosition = (
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
): CSSProperties => {
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!isOpen || !trigger || !menu) return;
    const borders = menu.offsetHeight - menu.clientHeight;
    setPosition(
      computeMenuPosition(
        trigger.getBoundingClientRect(),
        // scrollHeight is the full content height even while an earlier max-height caps it.
        { width: menu.offsetWidth, height: menu.scrollHeight + borders },
        {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
      ),
    );
  }, [isOpen, triggerRef, menuRef]);

  if (!position) return { top: 0, left: 0 };
  return position.maxHeight === undefined
    ? { top: position.top, left: position.left }
    : {
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
        overflowY: "auto",
      };
};
