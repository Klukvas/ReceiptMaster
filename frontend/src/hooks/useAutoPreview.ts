import { useEffect, useRef } from "react";
import type { DocumentDraftModel } from "./useDocumentDraft";

const QUIET_MS = 2000;
const MIN_GAP_MS = 4000;
const FIRST_RENDER_MS = 300;

/**
 * Keeps the PDF preview in step with the form: it re-renders shortly after the last change.
 * Rendering is a real PDF on the server (and the API allows 30 previews a minute), so it waits
 * for a quiet moment, never runs two at once, and leaves at least a few seconds between runs.
 * A 429 pauses it until the user presses Update.
 */
export function useAutoPreview(model: DocumentDraftModel, active: boolean) {
  const { config, file, logoAction, previewPaused, refreshing } = model;
  const lastRunAt = useRef(0);
  const refresh = useRef(model.refreshPreview);
  refresh.current = model.refreshPreview;

  const titleIncomplete =
    config?.title.mode === "custom" && !config.title.text.trim();
  // What the preview shows: any change here makes the shown PDF out of date.
  const signature = JSON.stringify([
    config,
    logoAction,
    file?.name,
    file?.size,
  ]);

  useEffect(() => {
    // After a failed render wait for the next edit (which clears the error) instead of retrying forever.
    if (
      !active ||
      !config ||
      previewPaused ||
      refreshing ||
      titleIncomplete ||
      model.previewError
    )
      return;
    if (!model.stale) return;
    const sinceLast = Date.now() - lastRunAt.current;
    const neverRendered = lastRunAt.current === 0;
    const delay = neverRendered
      ? FIRST_RENDER_MS
      : Math.max(QUIET_MS, MIN_GAP_MS - sinceLast);
    const timer = window.setTimeout(() => {
      lastRunAt.current = Date.now();
      void refresh.current();
    }, delay);
    return () => window.clearTimeout(timer);
    // `signature` stands for config, logo and file; the model's own objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    signature,
    previewPaused,
    refreshing,
    titleIncomplete,
    model.stale,
    model.previewError,
  ]);
}
