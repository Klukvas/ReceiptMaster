// Everything that knows the shape of a prerendered HTML document: what React's document
// output looks like, and which parts of the built index.html a page replaces. Pure string
// functions, so the build (render.tsx) and the regression spec use the same code.
import type { LanguageCode } from "../lib/languages";
import { PRERENDERED_ATTRIBUTE } from "./head";

/** A rendered page before it is placed into the template. */
export interface RenderedParts {
  /** The page's own `<title>`, `<meta>` and `<link>` tags. */
  readonly head: string;
  /** The markup that goes inside `#root`. */
  readonly body: string;
}

// The robots tag itself, not the word: a post may well be about "noindex".
const ROBOTS_NOINDEX = /<meta[^>]*name="robots"[^>]*noindex/;
const HEAD_OPEN = "<head>";
const HEAD_CLOSE = "</head>";
const BODY_OPEN = "<body>";
const DOCUMENT_CLOSE = "</body></html>";

/** Splits what React renders for `<html><head /><body>…</body></html>` into head and body. */
export function splitRenderedDocument(html: string): RenderedParts {
  const headStart = html.indexOf(HEAD_OPEN);
  const headEnd = html.indexOf(HEAD_CLOSE);
  const bodyStart = html.indexOf(BODY_OPEN, headEnd);
  if (headStart < 0 || headEnd < 0 || bodyStart < 0 || !html.endsWith(DOCUMENT_CLOSE)) {
    throw new Error("The rendered document is not <html><head>…</head><body>…</body></html>");
  }
  return {
    head: html.slice(headStart + HEAD_OPEN.length, headEnd),
    body: html.slice(bodyStart + BODY_OPEN.length, -DOCUMENT_CLOSE.length),
  };
}

/**
 * What is wrong with a rendered page, if anything. A page that came out as "not found" or lost
 * its tags must fail the build instead of being published.
 */
export function findRenderProblems({ head, body }: RenderedParts): string[] {
  const checks: ReadonlyArray<readonly [isWrong: boolean, problem: string]> = [
    [head.split("<title").length !== 2, "expected exactly one <title>"],
    [!head.includes('rel="canonical"'), "no canonical link"],
    [ROBOTS_NOINDEX.test(head), "marked noindex"],
    [!body.includes("<h1"), "no <h1> in the body"],
  ];
  return checks.filter(([isWrong]) => isWrong).map(([, problem]) => problem);
}

const TEMPLATE_HTML_OPEN = '<html lang="en">';
const TEMPLATE_DEFAULT_SEO = /<!-- seo:default:start[\s\S]*?<!-- seo:default:end -->/;
const TEMPLATE_EMPTY_ROOT = '<div id="root"></div>';
const HEAD_TAG_OPEN = /<(title|meta|link)(?=[\s>])/g;

function replaceOnce(
  html: string,
  target: string | RegExp,
  replacement: string,
  label: string,
): string {
  const parts = html.split(target);
  if (parts.length !== 2) {
    throw new Error(
      `The template must contain ${label} exactly once, found ${parts.length - 1}`,
    );
  }
  // Joined rather than String.replace: the replacement is page content, where "$&" is text.
  return parts.join(replacement);
}

/**
 * Places a rendered page into the built index.html: its language on `<html>`, its head tags
 * (each marked as prerendered) instead of the default SEO block, its markup inside `#root`.
 */
export function composePage(
  template: string,
  lang: LanguageCode,
  { head, body }: RenderedParts,
): string {
  const markedHead = head.replace(HEAD_TAG_OPEN, `<$1 ${PRERENDERED_ATTRIBUTE}=""`);
  const withLang = replaceOnce(
    template,
    TEMPLATE_HTML_OPEN,
    `<html lang="${lang}">`,
    TEMPLATE_HTML_OPEN,
  );
  const withHead = replaceOnce(
    withLang,
    TEMPLATE_DEFAULT_SEO,
    markedHead,
    "the seo:default block",
  );
  return replaceOnce(
    withHead,
    TEMPLATE_EMPTY_ROOT,
    `<div id="root">${body}</div>`,
    TEMPLATE_EMPTY_ROOT,
  );
}
