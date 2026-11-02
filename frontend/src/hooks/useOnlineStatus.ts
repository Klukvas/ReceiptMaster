import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

const getSnapshot = () => navigator.onLine;

// Rendering on a server has no connection state; assume online so nothing flashes.
const getServerSnapshot = () => true;

/** Mirrors `navigator.onLine`; it only knows about the device's link, not about our API. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
