import { findPrerenderedRoute } from "./routes";

/**
 * Loads the chunk of the page the build prerendered into `rootElement`, if it did. The app
 * mounts after this, so the static page stays on screen until the first commit can already be
 * the live page, with no spinner (and no layout shift) in between. Resolves at once elsewhere.
 */
export async function preloadPrerenderedPage(
  rootElement: HTMLElement,
  pathname: string,
): Promise<void> {
  if (!rootElement.hasChildNodes()) return;
  try {
    await findPrerenderedRoute(pathname)?.page.preload();
  } catch (error) {
    // Mount anyway: the route's lazy import fails the same way during render, where
    // AppErrorBoundary recovers from a missing chunk or shows the error.
    console.error("Preloading the prerendered page failed:", error);
  }
}
