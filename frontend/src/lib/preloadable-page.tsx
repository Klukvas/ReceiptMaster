import { lazy, type ComponentType } from "react";

type PageLoader = () => Promise<{ default: ComponentType }>;

export interface PreloadablePage {
  /** Renders the page: at once when `preload` has finished, through `React.lazy` otherwise. */
  readonly Page: ComponentType;
  /** Loads the page's chunk. Call it before the first render, not while `Page` is mounted. */
  readonly preload: () => Promise<void>;
}

/**
 * A lazy route page whose chunk can be loaded ahead of rendering. `React.lazy` always suspends
 * on its first render, even for a chunk that is already in memory, so a page that must appear
 * without the Suspense fallback (one replacing its prerendered HTML) needs this instead.
 */
export function preloadablePage(load: PageLoader): PreloadablePage {
  const LazyPage = lazy(load);
  // The one deliberate reassignment: a cache `Page` has to read synchronously while rendering.
  let LoadedPage: ComponentType | null = null;

  const Page: ComponentType = () =>
    LoadedPage ? <LoadedPage /> : <LazyPage />;

  const preload = async () => {
    LoadedPage = (await load()).default;
  };

  return { Page, preload };
}
