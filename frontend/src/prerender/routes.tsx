import { matchPath, Route } from "react-router-dom";
import { preloadablePage, type PreloadablePage } from "../lib/preloadable-page";
import { PrerenderedRoutePage } from "./PrerenderedRoutePage";

export const BLOG_LIST_PATH = "/blog";
export const BLOG_POST_PATH = "/blog/:slug";

interface PrerenderedRoute {
  readonly path: string;
  readonly page: PreloadablePage;
}

/**
 * Routes the build also writes out as static HTML (`frontend/prerender.mjs`), so crawlers and
 * link previews that run no JavaScript still get the content.
 */
const prerenderedRoutes: readonly PrerenderedRoute[] = [
  {
    path: BLOG_LIST_PATH,
    page: preloadablePage(() =>
      import("../pages/BlogListPage").then((m) => ({ default: m.BlogListPage })),
    ),
  },
  {
    path: BLOG_POST_PATH,
    page: preloadablePage(() =>
      import("../pages/BlogPostPage").then((m) => ({ default: m.BlogPostPage })),
    ),
  },
];

/** For `<Routes>`. The app and the build renderer mount the same elements, so they cannot drift. */
export const prerenderedRouteElements = prerenderedRoutes.map(({ path, page }) => (
  <Route key={path} path={path} element={<PrerenderedRoutePage page={page} />} />
));

export const findPrerenderedRoute = (
  pathname: string,
): PrerenderedRoute | undefined =>
  prerenderedRoutes.find(({ path }) => matchPath(path, pathname) !== null);
