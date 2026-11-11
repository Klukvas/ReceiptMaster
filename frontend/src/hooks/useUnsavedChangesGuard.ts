import { useEffect } from "react";
import i18n from "../lib/i18n";

/** Asked when a page holds unsaved edits of more than one kind (say, design and requisites). */
const GENERIC_CONFIRM_KEY = "common.discardUnsavedChanges";

/**
 * Every form with unsaved edits, by the translation key of the question it asks before they
 * are lost. One set of listeners serves them all, so leaving a page with two unsaved forms
 * asks once, not once per form.
 */
const dirtyForms = new Map<symbol, string>();
let detachListeners: (() => void) | null = null;

const confirmText = (): string => {
  const keys = new Set(dirtyForms.values());
  const [onlyKey] = keys;
  return i18n.t(keys.size === 1 && onlyKey ? onlyKey : GENERIC_CONFIRM_KEY);
};

const isPlainLeftClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey &&
  !event.altKey;

/** Asks before a link click, a Back/Forward step or a reload throws the unsaved edits away. */
function attachListeners(): () => void {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };
  const navigation = (event: MouseEvent) => {
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
    if (
      !link ||
      link.target === "_blank" ||
      link.hasAttribute("download") ||
      !isPlainLeftClick(event)
    )
      return;
    const target = new URL(link.href, window.location.href);
    if (
      target.pathname === window.location.pathname &&
      target.search === window.location.search
    )
      return;
    if (!window.confirm(confirmText())) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const currentIndex: unknown = window.history.state?.idx;
  let isRestoring = false;
  const historyNavigation = (event: PopStateEvent) => {
    if (isRestoring) {
      isRestoring = false;
      event.stopImmediatePropagation();
      return;
    }
    const nextIndex: unknown = event.state?.idx;
    if (
      typeof currentIndex === "number" &&
      typeof nextIndex === "number" &&
      currentIndex !== nextIndex &&
      !window.confirm(confirmText())
    ) {
      event.stopImmediatePropagation();
      isRestoring = true;
      window.history.go(currentIndex - nextIndex);
    }
  };
  window.addEventListener("popstate", historyNavigation, true);
  window.addEventListener("beforeunload", beforeUnload);
  document.addEventListener("click", navigation, true);
  return () => {
    window.removeEventListener("popstate", historyNavigation, true);
    window.removeEventListener("beforeunload", beforeUnload);
    document.removeEventListener("click", navigation, true);
  };
}

/**
 * While `isDirty`, leaving the page (a link, Back/Forward, reload or closing the tab) first
 * asks `confirmKey`'s question. In-page controls (tabs, buttons) are not guarded.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  confirmKey: string = GENERIC_CONFIRM_KEY,
): void {
  useEffect(() => {
    if (!isDirty) return;
    const form = Symbol("unsaved-form");
    dirtyForms.set(form, confirmKey);
    if (!detachListeners) detachListeners = attachListeners();
    return () => {
      dirtyForms.delete(form);
      if (dirtyForms.size === 0 && detachListeners) {
        detachListeners();
        detachListeners = null;
      }
    };
  }, [isDirty, confirmKey]);
}
