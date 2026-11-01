// A tab left open across a deploy asks for a lazy-route file that no longer
// exists. The app must reload once and carry on, and must never go blank: a file
// that stays missing, or any other render failure, ends on a friendly fallback
// instead of a reload loop.
//
// /terms is lazy and public, so no API mock is needed. The guard's wording and
// timing checks import the TypeScript module through the Vite dev server.

import { BASE_URL, withPage } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const VIEWPORT = { viewport: { width: 1280, height: 900 } };
const LAZY_ROUTE = `${BASE_URL}/terms`;
const LAZY_CHUNK = /\/(src\/pages\/)?TermsPage[^/]*\.(tsx|js)(\?.*)?$/;
const TERMS_HEADING = /terms/i;

/** Counts full page loads: a reload is one more navigation request for the document. */
const countDocumentLoads = (page) => {
  const loads = { count: 0 };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      loads.count += 1;
    }
  });
  return loads;
};

const fallbackIn = (page) => page.getByRole("alert");

/** A page in a fresh tab; the language is pinned so the copy checks are stable. */
const withTab = (run) =>
  withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    return run(page);
  });

// What asking for a removed chunk can look like, depending on the proxy in front.
const STALE_CHUNK_RESPONSES = [
  { name: "a 404", respond: (route) => route.fulfill({ status: 404 }) },
  {
    name: "the SPA's index.html",
    respond: (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html></html>",
      }),
  },
  { name: "a dropped connection", respond: (route) => route.abort() },
];

const staleChunkReloadsOnce = async (results, { name, respond }) => {
  await withTab(async (page) => {
    const loads = countDocumentLoads(page);
    let chunkRequests = 0;
    await page.route(LAZY_CHUNK, (route) => {
      chunkRequests += 1;
      return chunkRequests === 1 ? respond(route) : route.continue();
    });

    await page.goto(LAZY_ROUTE);
    await page.getByRole("heading", { name: TERMS_HEADING }).first().waitFor();
    results.check(
      `a stale chunk answered with ${name} reloads once and the route renders`,
      loads.count === 2 &&
        chunkRequests === 2 &&
        (await fallbackIn(page).count()) === 0,
      `document loads: ${loads.count}, chunk requests: ${chunkRequests}`,
    );
  });
};

const missingChunkEndsOnFallback = async (results) => {
  await withTab(async (page) => {
    const loads = countDocumentLoads(page);
    let isChunkGone = true;
    await page.route(LAZY_CHUNK, (route) =>
      isChunkGone ? route.abort() : route.continue(),
    );

    await page.goto(LAZY_ROUTE);
    const fallback = fallbackIn(page);
    await fallback.waitFor();
    // A loop would keep navigating; give it the time to show itself.
    await page.waitForTimeout(1500);
    results.check(
      "a chunk that stays missing stops after one reload",
      loads.count === 2,
      `document loads: ${loads.count}`,
    );
    const text = await fallback.innerText();
    results.check(
      "the fallback is friendly and leaks no error detail",
      text.includes("Something went wrong") &&
        !/dynamically imported|TypeError|\.tsx|\.js/i.test(text),
      JSON.stringify(text),
    );

    isChunkGone = false;
    await fallback.getByRole("button", { name: "Reload page" }).click();
    await page.getByRole("heading", { name: TERMS_HEADING }).first().waitFor();
    results.check(
      "the fallback's button reloads into the working route",
      (await fallbackIn(page).count()) === 0,
    );
  });
};

const renderCrashDoesNotReload = async (results) => {
  await withTab(async (page) => {
    const loads = countDocumentLoads(page);
    await page.route(LAZY_CHUNK, (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export const TermsPage = () => { throw new Error("render failed"); };',
      }),
    );

    await page.goto(LAZY_ROUTE);
    const fallback = fallbackIn(page);
    await fallback.waitFor();
    await page.waitForTimeout(500);
    results.check(
      "a render crash shows the fallback without reloading",
      loads.count === 1 && !(await fallback.innerText()).includes("render failed"),
      `document loads: ${loads.count}`,
    );
  });
};

const blockedStorageNeverLoops = async (results) => {
  await withTab(async (page) => {
    const loads = countDocumentLoads(page);
    // Only sessionStorage: the app itself needs localStorage to boot.
    await page.addInitScript(() => {
      const { getItem } = Storage.prototype;
      Storage.prototype.getItem = function guardedGetItem(key) {
        if (this === window.sessionStorage) {
          throw new DOMException("denied", "SecurityError");
        }
        return getItem.call(this, key);
      };
    });
    await page.route(LAZY_CHUNK, (route) => route.abort());

    await page.goto(LAZY_ROUTE);
    await fallbackIn(page).waitFor();
    await page.waitForTimeout(500);
    results.check(
      "without storage for the guard it falls back instead of risking a loop",
      loads.count === 1,
      `document loads: ${loads.count}`,
    );
  });
};

const guardAndWording = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    await page.goto(`${BASE_URL}/`);
    const outcome = await page.evaluate(async () => {
      const { CHUNK_RELOAD_GUARD_MS, claimChunkReload, isChunkLoadError } =
        await import("/src/lib/chunk-load.ts");
      sessionStorage.clear();
      const start = 1_000_000;
      return {
        recognised: [
          "Failed to fetch dynamically imported module: https://x.test/assets/a.js",
          "error loading dynamically imported module: https://x.test/assets/a.js",
          "Importing a module script failed.",
          "Unable to preload CSS for /assets/a.css",
        ].map((message) => isChunkLoadError(new TypeError(message))),
        unrelated: [
          isChunkLoadError(new Error("Cannot read properties of undefined")),
          isChunkLoadError("Failed to fetch dynamically imported module"),
          isChunkLoadError(null),
        ],
        first: claimChunkReload(start),
        withinWindow: claimChunkReload(start + CHUNK_RELOAD_GUARD_MS - 1),
        afterWindow: claimChunkReload(start + CHUNK_RELOAD_GUARD_MS),
      };
    });
    results.check(
      "every browser's chunk-failure wording is recognised",
      outcome.recognised.every(Boolean),
      JSON.stringify(outcome.recognised),
    );
    results.check(
      "other errors are not chunk failures",
      outcome.unrelated.every((isChunkError) => !isChunkError),
      JSON.stringify(outcome.unrelated),
    );
    results.check(
      "one reload per window, and a later deploy gets a new one",
      outcome.first && !outcome.withinWindow && outcome.afterWindow,
      JSON.stringify(outcome),
    );
  });
};

export const run = async () => {
  const results = new Results("chunk recovery");
  for (const response of STALE_CHUNK_RESPONSES) {
    await staleChunkReloadsOnce(results, response);
  }
  await missingChunkEndsOnFallback(results);
  await renderCrashDoesNotReload(results);
  await blockedStorageNeverLoops(results);
  await guardAndWording(results);
  return results;
};
