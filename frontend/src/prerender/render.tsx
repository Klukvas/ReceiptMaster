// Build-time entry: `frontend/prerender.mjs` bundles this file for Node and calls it once per
// target. It never runs in the browser.
import { renderToString } from "react-dom/server";
import { generatePath, Routes, StaticRouter } from "react-router-dom";
import { blogPosts, type BlogPost } from "../../content/blog";
import { AuthContext, type AuthContextType } from "../contexts/AuthContext.types";
import { ThemeContext } from "../contexts/ThemeContextInstance";
import type { ThemeContextType } from "../contexts/ThemeContext";
import i18n from "../lib/i18n";
import { composePage, findRenderProblems, splitRenderedDocument } from "./document";
import {
  BLOG_LIST_PATH,
  BLOG_POST_PATH,
  findPrerenderedRoute,
  prerenderedRouteElements,
} from "./routes";

/** One URL to write out as static HTML. */
export interface PrerenderTarget {
  readonly path: string;
  /** Language of the content, which is also the language the page chrome is rendered in. */
  readonly lang: BlogPost["lang"];
}

export const prerenderTargets: readonly PrerenderTarget[] = [
  { path: BLOG_LIST_PATH, lang: "en" },
  ...blogPosts.map((post) => ({
    path: generatePath(BLOG_POST_PATH, { slug: post.slug }),
    lang: post.lang,
  })),
];

const rejectAuthAction = async (): Promise<void> => {
  throw new Error("Auth actions are not available while prerendering");
};

// What a first-time visitor has before any effect runs: signed out, light theme.
const SIGNED_OUT: AuthContextType = {
  user: null,
  token: null,
  login: rejectAuthAction,
  register: rejectAuthAction,
  changePassword: rejectAuthAction,
  logout: rejectAuthAction,
  isLoading: false,
  isAuthenticated: false,
  hasProfileLoadError: false,
  retryLoadProfile: rejectAuthAction,
  refreshProfile: rejectAuthAction,
};

const LIGHT_THEME: ThemeContextType = {
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
};

/** The complete HTML file for `target`, built from the app's own index.html (`template`). */
export async function renderToDocument(
  template: string,
  { path, lang }: PrerenderTarget,
): Promise<string> {
  const route = findPrerenderedRoute(path);
  if (!route) throw new Error(`No prerendered route matches ${path}`);
  await route.page.preload();
  await i18n.changeLanguage(lang);

  // Rendered as a whole document so React collects the page's <title>, <meta> and <link> tags
  // (which <Helmet> emits as plain elements on React 19) into <head>, apart from the markup.
  const rendered = splitRenderedDocument(
    renderToString(
      <html lang={lang}>
        <head />
        <body>
          <ThemeContext.Provider value={LIGHT_THEME}>
            <AuthContext.Provider value={SIGNED_OUT}>
              <StaticRouter location={path}>
                <Routes>{prerenderedRouteElements}</Routes>
              </StaticRouter>
            </AuthContext.Provider>
          </ThemeContext.Provider>
        </body>
      </html>,
    ),
  );

  const problems = findRenderProblems(rendered);
  if (problems.length > 0) {
    throw new Error(`Prerendered ${path} looks wrong: ${problems.join("; ")}`);
  }
  return composePage(template, lang, rendered);
}
