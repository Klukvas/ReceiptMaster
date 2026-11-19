// Plan gating, for a Free and a Start account (stored as "free" and "pro"), at 1280px:
//  - Free: the analytics page is an upsell and its sidebar item carries a lock; the home page
//    shows this month's turnover with locked tiles for profit, the chart and low stock; the
//    stock value, logo upload, signature/stamp, numbering, presets and automatic receipts are
//    locked; suppliers are read-only; the recipient limit stops the create form; document
//    types outside the plan are listed locked. None of these surfaces calls an endpoint the
//    server would answer with 402.
//  - Start: all of that is open, analytics is limited to the plan's 90 days (no "1y" preset,
//    bounded date inputs, a note), and only the CSV export is locked.
//  - A lock is a real button whose click opens the upgrade dialog for its reason.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { makeOrder, subscriptionStatusFor } from "./support/fixtures.mjs";
import { documentHandlers, signoffHandlers } from "./support/document-mocks.mjs";

const VIEWPORT = { width: 1280, height: 900 };

// Endpoints that answer 402 without the feature; a locked surface must not call them.
const ANALYTICS_ONLY = [
  "/orders/dashboard/daily-revenue",
  "/orders/dashboard/revenue-by-products",
  "/orders/dashboard/revenue-by-recipients",
  "/orders/dashboard/total-revenue",
  "/orders/dashboard/turnover-by-products",
  "/orders/dashboard/turnover-by-recipients",
];
const STOCK_ONLY = ["/products/low-stock", "/products/stock-value"];

const SUPPLIER = {
  id: "supplier-1",
  name: "Roastery Wholesale",
  email: "sales@roastery.example",
  product_count: 0,
  created_at: "2026-01-02T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const withPlan = async (plan, usage, run, orders = []) =>
  withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState(orders);
    state.signoff = { signature: null, stamp: null };
    state.designId = "standard";
    state.handlers = [
      async (route, { path, method }, json) => {
        if (path === "/subscription/status")
          return json(route, subscriptionStatusFor(plan, usage)), true;
        if (path === "/settings/onboarding-status")
          return json(route, { data: { completed: true } }), true;
        if (path === "/settings/auto-receipt" && method === "GET")
          return json(route, { data: { enabled: false } }), true;
        if (path === "/suppliers" && method === "GET")
          return json(route, { data: [SUPPLIER], total: 1, offset: 0, limit: 10 }), true;
        if (path.startsWith("/orders/dashboard/") || path.startsWith("/products/"))
          return json(route, path.endsWith("status-summary") ? { draft: 1, confirmed: 2, cancelled: 0 } : []), true;
        return false;
      },
      ...signoffHandlers(state),
      ...documentHandlers(state),
    ];
    await installApiMocks(page, state);
    return run(page, state);
  });

const open = async (page, path) => {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
};

const called = (state, paths) =>
  state.requests.filter((request) => paths.some((path) => request.endsWith(` ${path}`)));

const isShown = (page, testId) =>
  settle(async () => (await page.getByTestId(testId).count()) > 0);

/** Clicks a lock and reports the title of the dialog it opens, then closes it. */
const dialogTitleAfter = async (page, lock) => {
  await lock.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  const title = await dialog.getByRole("heading").first().innerText();
  await dialog.getByRole("button", { name: "Close" }).click();
  await dialog.waitFor({ state: "hidden" });
  return title;
};

const checkFreeAnalytics = (results) =>
  withPlan("free", {}, async (page, state) => {
    await open(page, "/analytics");
    results.check("free: /analytics shows the upsell", await isShown(page, "analytics-upsell"));
    results.check(
      "free: /analytics calls no analytics endpoint",
      called(state, ANALYTICS_ONLY).length === 0,
      called(state, ANALYTICS_ONLY).join(", "),
    );
    const item = page.locator('#app-sidebar a[href="/analytics"]');
    results.check(
      "free: the Analytics sidebar item has a lock and says so in its name",
      (await item.getByTestId("sidebar-lock").count()) === 1 &&
        /Analytics\. .+/.test((await item.getAttribute("aria-label")) ?? ""),
      (await item.getAttribute("aria-label")) ?? "",
    );
    const lock = page.getByTestId("analytics-upsell").getByRole("button");
    results.check(
      "free: the upsell lock is a button that opens the analytics upgrade dialog",
      (await dialogTitleAfter(page, lock)) === "Analytics is not in your plan",
    );
  });

const checkFreeHome = (results) =>
  withPlan("free", {}, async (page, state) => {
    await open(page, "/dashboard");
    for (const testId of ["home-profit-lock", "home-sparkline-lock", "home-low-stock-lock"])
      results.check(`free: home shows ${testId}`, await isShown(page, testId));
    results.check(
      "free: home labels the turnover as this month's",
      await settle(() => page.getByText("Turnover this month", { exact: true }).isVisible()),
    );
    results.check(
      "free: home asks only for the order summary and the turnover",
      called(state, [...ANALYTICS_ONLY, ...STOCK_ONLY]).length === 0 &&
        called(state, ["/orders/dashboard/total-turnover", "/orders/dashboard/status-summary"]).length >= 2,
      state.requests.filter((request) => /dashboard\/|low-stock/.test(request)).join(", "),
    );
  });

const checkFreeSettings = (results) =>
  withPlan("free", {}, async (page) => {
    await open(page, "/settings?tab=documents");
    for (const testId of [
      "attribution-note",
      "logo-upload-lock",
      "signoff-signature-lock",
      "signoff-stamp-lock",
      "numbering-plan-note",
    ])
      results.check(`free: settings shows ${testId}`, await isShown(page, testId));
    results.check(
      "free: numbering stays readable but cannot be edited",
      await settle(async () => {
        const prefix = page.locator('input[id$="prefix"]').first();
        return (await prefix.count()) > 0 && (await prefix.isDisabled());
      }),
    );
    await page.getByText("Saved sets of settings", { exact: true }).first().click();
    results.check("free: presets show the upsell", await isShown(page, "presets-upsell"));
    results.check(
      "free: the logo lock opens the logo upgrade dialog",
      (await dialogTitleAfter(page, page.getByTestId("logo-upload-lock"))) === "Logo is not in your plan",
    );

    await open(page, "/settings?tab=advanced");
    results.check("free: automatic receipts show a lock", await isShown(page, "auto-receipt-lock"));
    await page.getByRole("switch").click();
    const dialog = page.getByRole("dialog");
    results.check(
      "free: switching automatic receipts on opens the upgrade dialog instead of saving",
      await settle(() => dialog.getByText("Automatic receipts are not in your plan").isVisible()),
    );

    await open(page, "/settings?tab=subscription");
    const summary = page.getByTestId("plan-limits-summary");
    await summary.waitFor();
    const main = await page.locator("main").innerText();
    results.check(
      "free: the subscription tab names the plan Free and lists its limits from the API",
      /\bFree\b/.test(main) && /1\/10/.test(main) && /Not included/.test(await summary.innerText()),
      await summary.innerText(),
    );
  });

const checkFreeLists = (results) =>
  withPlan("free", { recipientsCount: 10 }, async (page, state) => {
    await open(page, "/suppliers");
    results.check("free: suppliers stay listed", await settle(() => page.getByText(SUPPLIER.name).first().isVisible()));
    results.check(
      "free: adding a supplier is a lock that opens the suppliers upgrade dialog",
      (await dialogTitleAfter(page, page.getByTestId("suppliers-create-lock"))) === "Suppliers are not in your plan",
    );

    await open(page, "/products");
    results.check("free: the stock value is a locked tile", await isShown(page, "stock-value-lock"));
    results.check(
      "free: the products page does not ask for the stock value",
      called(state, ["/products/stock-value"]).length === 0,
    );

    await open(page, "/recipients");
    results.check(
      "free: the recipients page shows the usage against the plan limit",
      await settle(async () => /10\/10/.test(await page.locator("main").innerText())),
    );
    await page.getByRole("button", { name: /recipient/i }).first().click();
    results.check(
      "free: at the recipient limit Create opens the upgrade dialog, not the form",
      await settle(() => page.getByRole("dialog").getByText("Recipient limit reached").isVisible()),
    );
  });

const checkFreeDocumentTypes = (results) =>
  withPlan(
    "free",
    {},
    async (page) => {
      await open(page, "/orders");
      await page.getByText("Aurora Gating").first().click();
      const section = page.locator('section[aria-labelledby="order-documents-heading"]');
      await section.waitFor();
      results.check(
        "free: document types outside the plan are listed locked, the allowed ones stay buttons",
        (await section.getByTestId("document-type-lock-quote").count()) === 1 &&
          (await section.getByTestId("document-type-lock-act").count()) === 1 &&
          (await section.getByTestId("document-type-lock-invoice").count()) === 0 &&
          (await section.getByRole("button", { name: /invoice/i }).count()) >= 1,
        await section.innerText(),
      );
    },
    [makeOrder({ id: "order-1", receiptId: "receipt-1", receiptStatus: "generated", recipientName: "Aurora Gating" })],
  );

const checkStart = (results) =>
  withPlan("pro", {}, async (page, state) => {
    await open(page, "/analytics");
    results.check(
      "start: /analytics is open (no upsell) and the sidebar item has no lock",
      (await page.getByTestId("analytics-upsell").count()) === 0 &&
        (await page.getByTestId("sidebar-lock").count()) === 0,
    );
    results.check("start: the history note names the plan's window", await isShown(page, "analytics-history-note"));
    const presets = await page.locator("button[aria-pressed]").allInnerTexts();
    results.check(
      "start: period presets stop at the plan's 90 days",
      presets.includes("90d") && !presets.includes("1y"),
      presets.join(", "),
    );
    const earliest = await page.getByLabel("Start date").getAttribute("min");
    results.check(
      "start: the date inputs cannot go before the plan's window",
      /^\d{4}-\d{2}-\d{2}$/.test(earliest ?? "") &&
        (Date.now() - new Date(earliest).getTime()) / 86400000 < 92,
      String(earliest),
    );
    results.check(
      "start: analytics requests carry the limited start date",
      called(state, ANALYTICS_ONLY).length > 0,
    );
    results.check(
      "start: CSV export is a lock that opens the CSV upgrade dialog",
      (await dialogTitleAfter(page, page.getByTestId("csv-export-lock"))) === "CSV export is not in your plan",
    );

    await open(page, "/dashboard");
    results.check(
      "start: home has no locked tiles",
      (await page.locator("[data-plan-lock]").count()) === 0,
    );

    await open(page, "/settings?tab=documents");
    await page.getByTestId("signoff-signature").waitFor();
    results.check(
      "start: logo, signature, stamp and numbering are open",
      (await page.locator("[data-plan-lock]").count()) === 0 &&
        (await page.getByTestId("attribution-note").count()) === 0,
      await page.locator("[data-plan-lock]").evaluateAll((nodes) => nodes.map((node) => node.dataset.planLock).join(",")),
    );
    await open(page, "/settings?tab=subscription");
    await page.getByTestId("plan-limits-summary").waitFor();
    results.check(
      "start: the stored plan \"pro\" is shown as Start",
      await settle(() => page.locator("main span", { hasText: /^Start$/ }).first().isVisible()),
    );
  });

export const run = async () => {
  const results = new Results("plan gating");
  await checkFreeAnalytics(results);
  await checkFreeHome(results);
  await checkFreeSettings(results);
  await checkFreeLists(results);
  await checkFreeDocumentTypes(results);
  await checkStart(results);
  return results;
};
