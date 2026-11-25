// Blog prerender: the pure document functions the build composes pages with, and the browser
// handover from a prerendered page to the live app.
//
// The dev server prerenders nothing, so the handover runs on a document composed here with the
// build's own `composePage` from the dev index.html and served in place of the route. What it
// cannot cover is the server render itself; `yarn build` fails on a page that comes out wrong.

import { BASE_URL, createState, installApiMocks, launchBrowser } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const POST_PATH = "/blog/getting-started";
const POST_TITLE = "Getting Started with receiptmaster";
const DEFAULT_TITLE = "receiptmaster.org — Orders, Documents & Analytics";
const STATIC_PARTS = {
  head:
    '<title>Static title</title><meta name="description" content="static description"/>' +
    `<link rel="canonical" href="https://receiptmaster.org${POST_PATH}"/>`,
  body: '<div style="min-height:3000px"><h1>Static copy</h1></div>',
};
const SCROLLED_TO = 400;
const PAGE_CHUNK_DELAY_MS = 800;

/** Runs in the page: exercises src/prerender/document.ts and reports plain data. */
const exerciseDocumentFunctions = async () => {
  const { composePage, findRenderProblems, splitRenderedDocument } = await import(
    "/src/prerender/document.ts"
  );
  const messageOf = (run) => {
    try {
      run();
      return null;
    } catch (error) {
      return String(error.message);
    }
  };
  const template =
    '<!doctype html>\n<html lang="en">\n<head>\n<!-- seo:default:start (note) -->\n' +
    '<title>Default</title>\n<!-- seo:default:end -->\n</head>\n<body><div id="root"></div></body></html>';
  const goodHead = '<title>T</title><link rel="canonical" href="c"/>';
  const dollarParts = {
    head: '<title>Costs $& more</title><meta name="description" content="d"/><link rel="canonical" href="c"/>',
    body: "<h1>Price: $1 and $&</h1>",
  };
  return {
    split: splitRenderedDocument(
      '<!DOCTYPE html><html lang="en"><head><title>T</title></head><body><div>B</div></body></html>',
    ),
    splitFragment: messageOf(() => splitRenderedDocument("<div>B</div>")),
    problemsGood: findRenderProblems({ head: goodHead, body: "<h1>x</h1>" }),
    problemsAboutNoindex: findRenderProblems({
      head: '<title>What noindex means</title><link rel="canonical" href="c"/>',
      body: "<h1>x</h1>",
    }),
    problemsBad: findRenderProblems({
      head: '<title>A</title><title>B</title><meta name="robots" content="noindex, nofollow"/>',
      body: "<p>x</p>",
    }),
    composed: composePage(template, "uk", dollarParts),
    composeNoRoot: messageOf(() =>
      composePage(template.replace('<div id="root"></div>', ""), "en", dollarParts),
    ),
    composeTwoRoots: messageOf(() =>
      composePage(template.replace("</body>", '<div id="root"></div></body>'), "en", dollarParts),
    ),
  };
};

const checkDocumentFunctions = (results, got) => {
  results.check(
    "React's document output splits into head tags and body markup",
    got.split.head === "<title>T</title>" && got.split.body === "<div>B</div>",
    JSON.stringify(got.split),
  );
  results.check(
    "anything but a whole document is refused",
    got.splitFragment !== null,
    "a fragment was accepted",
  );
  results.check(
    "a complete page has no problems, and a title about noindex is not one",
    got.problemsGood.length === 0 && got.problemsAboutNoindex.length === 0,
    JSON.stringify([got.problemsGood, got.problemsAboutNoindex]),
  );
  results.check(
    "two titles, a robots noindex, no canonical and no h1 are each reported",
    got.problemsBad.length === 4,
    JSON.stringify(got.problemsBad),
  );
  results.check(
    "composing sets the language, marks the page's head tags and drops the default block",
    got.composed.includes('<html lang="uk">') &&
      got.composed.includes('<meta data-prerendered="" name="description"') &&
      got.composed.includes('<link data-prerendered="" rel="canonical"') &&
      !got.composed.includes("Default") &&
      !got.composed.includes("seo:default"),
    got.composed,
  );
  results.check(
    "page content keeps its dollar signs",
    got.composed.includes('<title data-prerendered="">Costs $& more</title>') &&
      got.composed.includes('<div id="root"><h1>Price: $1 and $&</h1></div>'),
    got.composed,
  );
  results.check(
    "a template without exactly one empty root is refused",
    got.composeNoRoot !== null && got.composeTwoRoots !== null,
    JSON.stringify([got.composeNoRoot, got.composeTwoRoots]),
  );
};

/** Init script: records whether a spinner ever shows or the heading ever goes missing. */
const watchHandover = () => {
  window.__handover = { sawSpinner: false, hadHeading: false, lostHeading: false };
  const look = () => {
    const root = document.getElementById("root");
    if (!root) return;
    const seen = window.__handover;
    if (root.querySelector('[role="status"]')) seen.sawSpinner = true;
    if (root.querySelector("h1")) seen.hadHeading = true;
    else if (seen.hadHeading) seen.lostHeading = true;
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", look);
};

const isAppMounted = () =>
  Object.keys(document.getElementById("root")).some((key) =>
    key.startsWith("__reactContainer"),
  );

const readHead = () => ({
  title: document.title,
  titles: [...document.head.querySelectorAll("title")].map((tag) => tag.textContent),
  descriptions: [...document.head.querySelectorAll('meta[name="description"]')].map(
    (tag) => tag.content,
  ),
  canonicals: document.head.querySelectorAll('link[rel="canonical"]').length,
  stillMarked: document.head.querySelectorAll("[data-prerendered]").length,
  scrollY: Math.round(window.scrollY),
  postDate: document.querySelector("article time")?.textContent,
});

const checkHandover = async (results, browser, prerenderedHtml) => {
  // West of Greenwich, where a date-only string formatted in local time reads a day early.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    timezoneId: "America/Los_Angeles",
  });
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(15000);
    await installApiMocks(page, createState());
    await page.addInitScript(watchHandover);
    await page.route(`${BASE_URL}${POST_PATH}`, (route) =>
      route.fulfill({ contentType: "text/html", body: prerenderedHtml }),
    );
    await page.route(/\/src\/pages\/BlogPostPage\.tsx/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, PAGE_CHUNK_DELAY_MS));
      await route.continue();
    });

    await page.goto(`${BASE_URL}${POST_PATH}`, { waitUntil: "commit" });
    await page.waitForSelector("h1");
    await page.evaluate((top) => window.scrollTo(0, top), SCROLLED_TO);
    const wasMountedBeforeChunk = await page.evaluate(isAppMounted);
    await page.waitForFunction(
      (title) => document.querySelector("article h1")?.textContent === title,
      POST_TITLE,
    );
    await page.waitForFunction(
      () => document.head.querySelectorAll("[data-prerendered]").length === 0,
    );
    const seen = await page.evaluate(() => window.__handover);
    const head = await page.evaluate(readHead);

    results.check(
      "the app keeps the prerendered page until the page's own code has loaded",
      wasMountedBeforeChunk === false,
      "the app mounted while the page chunk was still loading",
    );
    results.check(
      "the handover shows no spinner and never drops the content",
      !seen.sawSpinner && seen.hadHeading && !seen.lostHeading,
      JSON.stringify(seen),
    );
    results.check(
      "a reader who scrolled the static page stays where they were",
      Math.abs(head.scrollY - SCROLLED_TO) <= 5,
      `scrollY ${head.scrollY}`,
    );
    results.check(
      "the build's head tags give way to the live page's, the title to the default",
      head.stillMarked === 0 &&
        head.title === `${POST_TITLE} — receiptmaster` &&
        head.titles.includes(DEFAULT_TITLE) &&
        !head.titles.includes("Static title") &&
        head.descriptions.length === 1 &&
        head.descriptions[0] !== "static description" &&
        head.canonicals === 1,
      JSON.stringify(head),
    );
    results.check(
      "the post date is the published date in every time zone",
      head.postDate === "March 10, 2026",
      String(head.postDate),
    );

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.locator('article a[href="/blog"]').click();
    await page.waitForFunction(() => document.title.startsWith("Blog"));
    const scrollYAfterNavigation = await page.evaluate(() => Math.round(window.scrollY));
    results.check(
      "navigating to another page still starts at the top",
      scrollYAfterNavigation === 0,
      `scrollY ${scrollYAfterNavigation}`,
    );
  } finally {
    await context.close();
  }
};

export const run = async () => {
  const results = new Results("blog prerender");
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/blog`, { waitUntil: "domcontentloaded" });
    checkDocumentFunctions(results, await page.evaluate(exerciseDocumentFunctions));

    const template = await (await page.request.get(`${BASE_URL}/index.html`)).text();
    const prerenderedHtml = await page.evaluate(
      async ({ html, parts }) => {
        const { composePage } = await import("/src/prerender/document.ts");
        return composePage(html, "en", parts);
      },
      { html: template, parts: STATIC_PARTS },
    );
    await context.close();

    await checkHandover(results, browser, prerenderedHtml);
  } finally {
    await browser.close();
  }
  return results;
};
