import { useEffect } from "react";
import type { PreloadablePage } from "../lib/preloadable-page";
import { resetPrerenderedHead } from "./head";

/** The element of a prerendered route: the page, plus the handover from its static copy. */
export const PrerenderedRoutePage = ({ page }: { page: PreloadablePage }) => {
  // A parent's effect runs after its children are committed, so the page's own head tags are
  // already in place when the build's copies go.
  useEffect(resetPrerenderedHead, []);

  return <page.Page />;
};
