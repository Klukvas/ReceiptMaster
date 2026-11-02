// Two tabs of one browser context share localStorage, like two real tabs. The
// API is a stateful mock on the context: the server redeems a refresh token
// once, so of two tabs refreshing with the same token one wins and one gets 401.
//
// The session is seeded once by a guarded init script. installApiMocks is not
// used on purpose: its init script re-seeds the tokens on every navigation,
// which would hide exactly the storage races these checks are about.

import { BASE_URL, launchBrowser } from "./support/harness.mjs";
import { SUBSCRIPTION_STATUS, USER, paginated } from "./support/fixtures.mjs";
import { Results, waitFor } from "./support/runner.mjs";

const A1 = "access-A1";
const R1 = "refresh-R1";
const A2 = "access-A2";
const R2 = "refresh-R2";
const UNAUTHORIZED = {
  error: "Unauthorized access",
  errorCode: "UNAUTHORIZED",
};
const BARRIER_TIMEOUT_MS = 10000;
const SIGNED_IN_TIMEOUT_MS = 10000;
// The early loser's 401 arrives this long before the winner's 201. Longer than
// the former fixed 300 ms re-read, well inside the bounded 3 s wait.
const WINNER_DELAY_MS = 800;

const AUTHORIZED_DATA = {
  "/auth/profile": USER,
  "/subscription/status": SUBSCRIPTION_STATUS,
  "/products": paginated([]),
  "/products/stock-value": {
    currency: "UAH",
    purchaseValueCents: 0,
    saleValueCents: 0,
    totalUnits: 0,
    productCount: 0,
  },
  "/recipients": paginated([]),
  "/orders": paginated([]),
  "/receipts": paginated([]),
  "/receipts/printers": { printers: [] },
};

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

/** A promise resolved from outside; never waits longer than the deadline. */
const barrier = () => {
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  return {
    release,
    wait: () =>
      Promise.race([
        released,
        new Promise((resolve) => setTimeout(resolve, BARRIER_TIMEOUT_MS)),
      ]),
  };
};

const openTabs = async (browser, labels) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(
    ({ access, refresh }) => {
      if (localStorage.getItem("e2e_session_seeded")) return;
      localStorage.setItem("e2e_session_seeded", "1");
      localStorage.setItem("auth_token", access);
      localStorage.setItem("refresh_token", refresh);
      localStorage.setItem("i18nextLng", "en");
    },
    { access: A1, refresh: R1 },
  );
  const tabs = new Map();
  const navigations = new Map();
  for (const label of labels) {
    const page = await context.newPage();
    page.setDefaultTimeout(SIGNED_IN_TIMEOUT_MS);
    tabs.set(page, label);
    navigations.set(label, []);
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame())
        navigations.get(label).push(new URL(frame.url()).pathname);
    });
  }
  return { context, tabs, pages: [...tabs.keys()], navigations };
};

/**
 * Routes every API call. Requests carrying A2 succeed; anything else is the
 * scenario's to answer (`stale`, `refresh`). Each call is logged with its tab.
 */
const installSessionApi = async (context, tabs, scenario) => {
  const log = [];
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const entry = {
      tab: tabs.get(request.frame().page()) ?? "?",
      method: request.method(),
      path,
      bearer: (request.headers().authorization || "").replace(/^Bearer /, ""),
      body: request.method() === "POST" ? request.postDataJSON() : null,
    };
    log.push(entry);
    scenario.onRequest?.(entry);
    if (path === "/auth/refresh") return scenario.refresh(route, entry);
    if (entry.bearer === A2) {
      const body =
        AUTHORIZED_DATA[path] ?? (path.startsWith("/settings/") ? {} : null);
      return body === null ? json(route, {}, 404) : json(route, body);
    }
    return scenario.stale(route, entry);
  });
  return log;
};

const storedSession = (page) =>
  page.evaluate(() => ({
    access: localStorage.getItem("auth_token"),
    refresh: localStorage.getItem("refresh_token"),
  }));

// ProtectedRoute renders the login form instead of the page when signed out.
const isSignedIn = async (page) => {
  try {
    await page.getByRole("heading", { level: 1, name: "Products" }).waitFor();
    return new URL(page.url()).pathname === "/products";
  } catch {
    return false;
  }
};

const lateLoserKeepsWinnerSession = async (browser, results) => {
  const { context, tabs, pages, navigations } = await openTabs(browser, [
    "A",
    "B",
  ]);
  const bothRefreshing = barrier();
  const winnerOnNewToken = barrier();
  const refreshes = [];
  const log = await installSessionApi(context, tabs, {
    onRequest: (entry) => {
      if (entry.bearer === A2 && entry.tab === refreshes[0]?.tab)
        winnerOnNewToken.release();
    },
    refresh: async (route, entry) => {
      refreshes.push(entry);
      if (refreshes.length === 2) bothRefreshing.release();
      if (refreshes[0] === entry) {
        await bothRefreshing.wait();
        return json(
          route,
          { access_token: A2, refresh_token: R2, user: USER },
          201,
        );
      }
      // The loser's rejection arrives after the winner stored and used A2.
      await winnerOnNewToken.wait();
      return json(route, UNAUTHORIZED, 401);
    },
    stale: (route) => json(route, UNAUTHORIZED, 401),
  });
  try {
    await Promise.all(pages.map((page) => page.goto(`${BASE_URL}/products`)));
    await waitFor(() => refreshes.length >= 2, {
      timeoutMs: SIGNED_IN_TIMEOUT_MS,
      label: "both tabs to refresh",
    }).catch(() => undefined);
    const loser = refreshes[1]?.tab;
    const loserRefreshAt = log.indexOf(refreshes[1]);
    const loserRetried = () =>
      log.some(
        (entry, index) =>
          index > loserRefreshAt &&
          entry.tab === loser &&
          entry.path === "/auth/profile" &&
          entry.bearer === A2,
      );
    await waitFor(loserRetried, {
      timeoutMs: SIGNED_IN_TIMEOUT_MS,
      label: "the losing tab to retry with A2",
    }).catch(() => undefined);

    results.check(
      "late loser: both tabs refreshed with the same old token",
      refreshes.length === 2 &&
        new Set(refreshes.map((entry) => entry.tab)).size === 2 &&
        refreshes.every((entry) => entry.body?.refresh_token === R1),
      JSON.stringify(refreshes.map(({ tab, body }) => ({ tab, body }))),
    );
    const sessions = await Promise.all(pages.map(storedSession));
    results.check(
      "late loser: storage keeps the winner's A2/R2",
      sessions.every((s) => s.access === A2 && s.refresh === R2),
      JSON.stringify(sessions),
    );
    results.check(
      "late loser: the losing tab retried its request with A2",
      loserRetried(),
      JSON.stringify(log.filter((entry) => entry.tab === loser)),
    );
    const signedIn = await Promise.all(pages.map(isSignedIn));
    results.check(
      "late loser: both tabs stay signed in",
      signedIn.every(Boolean),
      JSON.stringify(signedIn),
    );
    const redirects = [...navigations.values()].flat().filter((p) => p === "/");
    results.check(
      "late loser: no tab was redirected to the landing page",
      redirects.length === 0,
      JSON.stringify(Object.fromEntries(navigations)),
    );
  } finally {
    await context.close();
  }
};

const genuineRejectionSignsOut = async (browser, results) => {
  const { context, tabs, pages } = await openTabs(browser, ["A"]);
  const [page] = pages;
  const log = await installSessionApi(context, tabs, {
    refresh: (route) => json(route, UNAUTHORIZED, 401),
    stale: (route) => json(route, UNAUTHORIZED, 401),
  });
  try {
    await page.goto(`${BASE_URL}/products`);
    const redirected = await page
      .locator("#email")
      .waitFor({ timeout: 10000 })
      .then(() => new URL(page.url()).pathname === "/products")
      .catch(() => false);
    const refreshes = log.filter((entry) => entry.path === "/auth/refresh");
    results.check(
      "genuine rejection: the current refresh token was sent once",
      refreshes.length === 1 && refreshes[0].body?.refresh_token === R1,
      JSON.stringify(refreshes),
    );
    const session = await storedSession(page);
    results.check(
      "genuine rejection: storage is cleared",
      session.access === null && session.refresh === null,
      JSON.stringify(session),
    );
    results.check(
      "genuine rejection: login form shown in place on the private page",
      redirected,
      page.url(),
    );
  } finally {
    await context.close();
  }
};

const staleTabAdoptsStoredToken = async (browser, results) => {
  const { context, tabs, pages, navigations } = await openTabs(browser, [
    "A",
    "B",
  ]);
  const [pageA, pageB] = pages;
  const bOnNewToken = barrier();
  const log = await installSessionApi(context, tabs, {
    onRequest: (entry) => {
      if (entry.tab === "B" && entry.bearer === A2) bOnNewToken.release();
    },
    refresh: (route, entry) =>
      entry.tab === "B"
        ? json(route, { access_token: A2, refresh_token: R2, user: USER }, 201)
        : // R1 is already redeemed by tab B.
          json(route, UNAUTHORIZED, 401),
    stale: async (route, entry) => {
      // Tab A's old-token requests fail only after tab B has refreshed.
      if (entry.tab === "A") await bOnNewToken.wait();
      return json(route, UNAUTHORIZED, 401);
    },
  });
  try {
    await pageA.goto(`${BASE_URL}/products`);
    await waitFor(
      () => log.some((entry) => entry.tab === "A" && entry.bearer === A1),
      { label: "tab A's first request with A1" },
    );
    await pageB.goto(`${BASE_URL}/products`);
    const signedIn = await isSignedIn(pageA);

    const refreshes = log.filter((entry) => entry.path === "/auth/refresh");
    results.check(
      "pre-check: only the tab that refreshed called /auth/refresh",
      refreshes.length === 1 && refreshes[0].tab === "B",
      JSON.stringify(refreshes),
    );
    results.check(
      "pre-check: tab A retried with A2 from storage",
      log.some(
        (entry) =>
          entry.tab === "A" &&
          entry.path === "/auth/profile" &&
          entry.bearer === A2,
      ),
      JSON.stringify(log.filter((entry) => entry.tab === "A")),
    );
    const session = await storedSession(pageA);
    results.check(
      "pre-check: tab A is signed in with the stored A2/R2",
      signedIn &&
        session.access === A2 &&
        session.refresh === R2 &&
        !navigations.get("A").includes("/"),
      JSON.stringify({ signedIn, session, navigations: navigations.get("A") }),
    );
  } finally {
    await context.close();
  }
};

/**
 * The loser's refresh is rejected at once; the winner's rotation is answered
 * only `WINNER_DELAY_MS` later. With `winnerAccess` equal to A1 the winner keeps
 * the access token and only rotates the refresh token.
 */
const earlyLoserAdoptsWinner = async (
  browser,
  results,
  label,
  winnerAccess,
) => {
  const { context, tabs, pages, navigations } = await openTabs(browser, [
    "A",
    "B",
  ]);
  const bothRefreshing = barrier();
  const loserAnswered = barrier();
  const refreshes = [];
  let rotated = false;
  const succeed = (route, path) => {
    const body =
      AUTHORIZED_DATA[path] ?? (path.startsWith("/settings/") ? {} : null);
    return body === null ? json(route, {}, 404) : json(route, body);
  };
  const log = await installSessionApi(context, tabs, {
    refresh: async (route, entry) => {
      refreshes.push(entry);
      if (refreshes.length === 2) bothRefreshing.release();
      await bothRefreshing.wait();
      if (refreshes[1] === entry) {
        await json(route, UNAUTHORIZED, 401);
        loserAnswered.release();
        return;
      }
      await loserAnswered.wait();
      await new Promise((resolve) => setTimeout(resolve, WINNER_DELAY_MS));
      rotated = true;
      return json(
        route,
        { access_token: winnerAccess, refresh_token: R2, user: USER },
        201,
      );
    },
    // After the rotation the winner's access token is valid, even when it is A1.
    stale: (route, entry) =>
      rotated && entry.bearer === winnerAccess
        ? succeed(route, entry.path)
        : json(route, UNAUTHORIZED, 401),
  });
  try {
    await Promise.all(pages.map((page) => page.goto(`${BASE_URL}/products`)));
    await waitFor(() => refreshes.length >= 2, {
      timeoutMs: SIGNED_IN_TIMEOUT_MS,
      label: "both tabs to refresh",
    }).catch(() => undefined);
    const loser = refreshes[1]?.tab;
    const loserRefreshAt = log.indexOf(refreshes[1]);
    const loserRetried = () =>
      log.some(
        (entry, index) =>
          index > loserRefreshAt &&
          entry.tab === loser &&
          entry.path === "/auth/profile" &&
          entry.bearer === winnerAccess,
      );
    await waitFor(loserRetried, {
      timeoutMs: SIGNED_IN_TIMEOUT_MS,
      label: "the losing tab to retry with the winner's token",
    }).catch(() => undefined);

    const sessions = await Promise.all(pages.map(storedSession));
    results.check(
      `${label}: storage holds the winner's session`,
      sessions.every((s) => s.access === winnerAccess && s.refresh === R2),
      JSON.stringify(sessions),
    );
    results.check(
      `${label}: the tab rejected first retried with the winner's access token`,
      loserRetried(),
      JSON.stringify(log.filter((entry) => entry.tab === loser)),
    );
    const signedIn = await Promise.all(pages.map(isSignedIn));
    const redirects = [...navigations.values()].flat().filter((p) => p === "/");
    results.check(
      `${label}: both tabs stay signed in, no redirect to the landing page`,
      signedIn.every(Boolean) && redirects.length === 0,
      JSON.stringify({
        signedIn,
        navigations: Object.fromEntries(navigations),
      }),
    );
  } finally {
    await context.close();
  }
};

/** A refresh that never reached a verdict must not end the session. */
const transportFailureKeepsSession = async (browser, results, label, fail) => {
  const { context, tabs, pages, navigations } = await openTabs(browser, ["A"]);
  const [page] = pages;
  const refreshed = barrier();
  const log = await installSessionApi(context, tabs, {
    refresh: async (route) => {
      await fail(route);
      refreshed.release();
    },
    stale: (route) => json(route, UNAUTHORIZED, 401),
  });
  try {
    await page.goto(`${BASE_URL}/products`);
    await refreshed.wait();
    // The profile could not be loaded, so the protected page offers a retry
    // instead of a login form; a cleared session would reload to the login form.
    await page.getByRole("alert").getByRole("button", { name: "Retry" }).waitFor();
    const session = await storedSession(page);
    results.check(
      `${label}: refresh was attempted once with R1`,
      log.filter((entry) => entry.path === "/auth/refresh").length === 1,
      JSON.stringify(log),
    );
    results.check(
      `${label}: storage keeps A1/R1`,
      session.access === A1 && session.refresh === R1,
      JSON.stringify(session),
    );
    results.check(
      `${label}: no redirect to the landing page`,
      !navigations.get("A").includes("/") &&
        new URL(page.url()).pathname === "/products",
      JSON.stringify({ url: page.url(), navigations: navigations.get("A") }),
    );
  } finally {
    await context.close();
  }
};

export const run = async () => {
  const results = new Results("auth multi-tab");
  const browser = await launchBrowser();
  try {
    await lateLoserKeepsWinnerSession(browser, results);
    await genuineRejectionSignsOut(browser, results);
    await staleTabAdoptsStoredToken(browser, results);
    await earlyLoserAdoptsWinner(browser, results, "early loser", A2);
    await earlyLoserAdoptsWinner(
      browser,
      results,
      "early loser, same access token",
      A1,
    );
    await transportFailureKeepsSession(
      browser,
      results,
      "network error",
      (route) => route.abort("failed"),
    );
    await transportFailureKeepsSession(
      browser,
      results,
      "server error",
      (route) =>
        json(
          route,
          {
            error: "Internal server error",
            errorCode: "INTERNAL_SERVER_ERROR",
          },
          503,
        ),
    );
  } finally {
    await browser.close();
  }
  return results;
};
