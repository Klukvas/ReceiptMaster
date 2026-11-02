import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * While a dialog is open it owns one marker history entry, so the browser Back button
 * (the phone's back gesture) closes the dialog instead of leaving the page.
 *
 * The marker copies `history.state` as is (react-router keeps `idx`/`key` there), so the
 * router and the settings unsaved-draft guard, which compares `idx`, see no navigation.
 * A normal close (X, Esc, overlay, submit) removes its own marker again, so no dead entry
 * is left behind. Back always closes only the topmost dialog.
 *
 * History traversal is asynchronous (it ends in a `popstate`), so pushes and pops are
 * serialised: nothing is pushed while a pop of ours is still in flight.
 */

interface Entry {
  id: symbol;
  close: () => void;
  status: "queued" | "pushed" | "released";
}

const MARKER_KEY = "backClosesDialog";
const POP_TIMEOUT_MS = 500;
const RESTORE_CHECK_MS = 100;

const entries: Entry[] = [];
let pendingPops = 0;
let isAwaitingPop = false;
let popTimeout: ReturnType<typeof setTimeout> | undefined;

const hasMarker = () =>
  typeof window.history.state === "object" &&
  window.history.state !== null &&
  MARKER_KEY in window.history.state;

const finishPop = () => {
  isAwaitingPop = false;
  clearTimeout(popTimeout);
  drain();
};

function drain(): void {
  if (isAwaitingPop) return;

  if (pendingPops > 0) {
    const count = pendingPops;
    pendingPops = 0;
    // The router may have navigated on top of our markers; only ever step back over our own.
    if (hasMarker()) {
      isAwaitingPop = true;
      popTimeout = setTimeout(finishPop, POP_TIMEOUT_MS);
      window.history.go(-count);
      return;
    }
  }

  entries
    .filter((entry) => entry.status === "queued")
    .forEach((entry) => {
      window.history.pushState(
        { ...window.history.state, [MARKER_KEY]: true },
        "",
      );
      entry.status = "pushed";
    });
}

function handlePopState(): void {
  if (isAwaitingPop) {
    finishPop();
    return;
  }
  const topmost = [...entries].reverse().find((entry) => entry.status === "pushed");
  if (!topmost) return;

  // Back consumed this entry's marker already; the dialog's cleanup must not pop again.
  topmost.status = "released";
  entries.splice(entries.indexOf(topmost), 1);
  topmost.close();

  // A dialog that refuses to close (unsaved-changes guard) needs its marker back.
  setTimeout(() => {
    if (topmost.status === "released" && stillOpen.has(topmost.id)) {
      topmost.status = "queued";
      entries.push(topmost);
      drain();
    }
  }, RESTORE_CHECK_MS);
}

const stillOpen = new Set<symbol>();
let isListening = false;

function open(entry: Entry): void {
  if (!isListening) {
    window.addEventListener("popstate", handlePopState);
    isListening = true;
  }
  stillOpen.add(entry.id);
  entries.push(entry);
  drain();
}

function release(entry: Entry): void {
  stillOpen.delete(entry.id);
  const wasPushed = entry.status === "pushed";
  entry.status = "released";
  const position = entries.indexOf(entry);
  if (position !== -1) entries.splice(position, 1);
  if (wasPushed) {
    pendingPops += 1;
    drain();
  }
}

export function useBackClosesDialog(isOpen: boolean, onClose?: () => void): void {
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const entry: Entry = {
      id: Symbol("dialog"),
      close: () => onCloseRef.current?.(),
      status: "queued",
    };
    open(entry);
    return () => release(entry);
  }, [isOpen]);
}
