// The wording differs per browser: Chromium, Firefox, Safari, then Vite's preload helper.
const CHUNK_LOAD_ERROR =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i;

const LAST_RELOAD_KEY = "chunk-reload-at";

/** Failing again this soon after a reload is an outage, not a stale tab. */
export const CHUNK_RELOAD_GUARD_MS = 60_000;

/** A lazy route's file is gone: usually a tab left open across a deploy. */
export const isChunkLoadError = (error: unknown): boolean =>
  error instanceof Error && CHUNK_LOAD_ERROR.test(error.message);

/**
 * Takes the tab's one automatic reload. False while the last one is recent, and
 * when storage is unavailable, because an unguarded reload could loop forever.
 */
export const claimChunkReload = (now: number = Date.now()): boolean => {
  try {
    const lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY));
    if (now - lastReload < CHUNK_RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
    return true;
  } catch (error) {
    console.warn("Chunk reload guard unavailable", error);
    return false;
  }
};
