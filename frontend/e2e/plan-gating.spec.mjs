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
//  - A 402 on create keeps the form and what was typed; a document whose file was removed
//    offers no download, share or replacement; automatic receipts left on from a higher plan
//    say so and can be switched off.
//  - With billing on (the build flag is swapped for the page): a template lock names the plan
//    that has that template, the carousel ignores keys under the upgrade dialog, and an
//    unknown plan status sells nothing.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { makeOrder, subscriptionStatusFor } from "./support/fixtures.mjs";
import { TEMPLATES, documentHandlers, signoffHandlers } from "./support/document-mocks.mjs";

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

// The dev server is built with billing off. A spec that needs the purchase surface swaps the
// module that reads the build flag and lets the capability check answer "enabled".
const enableBilling = (page) =>
  page.route("**/src/providers/billing-enabled.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export function resolveBillingEnabled() { return true; }",
    }),
  );

const PURCHASE_BUTTONS = /upgrade to|switch to|open plans|manage subscription/i;

const withPlan = async (plan, usage, run, orders = [], { billing = false } = {}) =>
  withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(8000);
    if (billing) await enableBilling(page);
    const state = createState(orders);
    state.analyticsQueries = [];
    state.signoff = { signature: null, stamp: null };
    state.designId = "standard";
    state.handlers = [
      async (route, { path, method, search }, json) => {
        if (path === "/billing/config")
          return json(route, { billingEnabled: billing }), true;
        if (ANALYTICS_ONLY.includes(path)) state.analyticsQueries.push(new URLSearchParams(search));
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

/** Opens every documents sub-tab once; a visited sub-tab stays mounted, only hidden. */
const visitDocumentSections = async (page) => {
  for (const section of ["company", "design", "numbering"]) {
    await page.locator(`#documents-section-${section}`).click();
    await page.waitForLoadState("networkidle");
  }
};

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
    await visitDocumentSections(page);
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
    await page.locator("#documents-section-design").click();
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
    const startDates = () => [...new Set(state.analyticsQueries.map((query) => query.get("startDate")))];
    results.check(
      "start: every analytics request asks from the first day of the plan's window",
      state.analyticsQueries.length > 0 && startDates().length === 1 && startDates()[0] === earliest,
      `sent ${startDates().join(", ")}; window starts ${earliest}`,
    );
    const startInput = page.getByLabel("Start date");
    await startInput.fill("");
    await startInput.blur();
    await page.waitForLoadState("networkidle");
    results.check(
      "start: a cleared start date is put back to the window's first day, never \"All time\"",
      (await startInput.inputValue()) === earliest &&
        startDates().length === 1 &&
        startDates()[0] === earliest &&
        !/All time/.test(await page.locator("main").innerText()),
      `field ${await startInput.inputValue()}; sent ${startDates().join(", ")}`,
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
    await visitDocumentSections(page);
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

const PRODUCT_LIMIT = { error: "Product limit reached", errorCode: "PRODUCT_LIMIT_EXCEEDED" };
const UNKNOWN_REFUSAL = { error: "Not on this plan", errorCode: "SOMETHING_NEWER" };

const checkRefusedCreateKeepsForm = (results) =>
  withPlan("free", {}, async (page, state) => {
    const refusals = [PRODUCT_LIMIT, UNKNOWN_REFUSAL];
    state.handlers.unshift(async (route, { path, method }, json) => {
      if (path !== "/products" || method !== "POST") return false;
      await json(route, refusals.shift() ?? UNKNOWN_REFUSAL, 402);
      return true;
    });
    await open(page, "/products");
    await page.getByRole("button", { name: "Create Product" }).first().click();
    const name = page.getByLabel("Product Name");
    await name.fill("Kenya AA beans 250g");
    await page.getByLabel("Purchase Price").fill("7.5");
    await page.getByLabel("Sale Price").fill("12.4");
    await page.getByLabel("Quantity").fill("31");
    const create = page.getByRole("button", { name: "Create", exact: true });
    await create.click();
    const notice = page.getByTestId("plan-refusal");
    await notice.waitFor();
    const typed = async () =>
      [await name.inputValue(), await page.getByLabel("Sale Price").inputValue(), await page.getByLabel("Quantity").inputValue()].join("|");
    results.check(
      "free: a 402 on product create keeps the form open with everything typed",
      (await typed()) === "Kenya AA beans 250g|12.4|31" && (await page.getByRole("dialog").count()) === 1,
      await typed(),
    );
    results.check(
      "free: the refusal is explained inside the form, with no purchase control while billing is off",
      /Product limit reached/.test(await notice.innerText()) &&
        (await page.getByTestId("plan-refusal-upgrade").count()) === 0 &&
        (await page.getByRole("button", { name: PURCHASE_BUTTONS }).count()) === 0,
      await notice.innerText(),
    );
    await create.click();
    results.check(
      "free: a 402 with a code this client does not know is not shown as the product limit",
      await settle(async () => {
        const text = await notice.innerText();
        return /not included in your plan/i.test(text) && !/Product limit/.test(text);
      }),
      await notice.innerText(),
    );
    results.check("free: the form still holds the typed values after the second refusal", (await typed()) === "Kenya AA beans 250g|12.4|31");
  });

const purgedOrder = () => {
  const order = makeOrder({ id: "order-1", receiptId: "receipt-1", receiptStatus: "generated", recipientName: "Aurora Purged" });
  const [current] = order.receipts;
  return {
    ...order,
    receipts: [
      { ...current, purged: true },
      { ...current, id: "receipt-0", number: "R-0000", status: "void", purged: true, created_at: "2026-01-20T10:00:00.000Z", voided_at: "2026-01-21T10:00:00.000Z" },
    ],
  };
};

const checkPurgedDocument = (results) =>
  withPlan(
    "free",
    {},
    async (page) => {
      await open(page, "/orders");
      await page.getByText("Aurora Purged").first().click();
      const card = page.getByTestId("document-card").first();
      await card.waitFor();
      // textContent, not the accessible tree: the voided history sits in a closed <details>.
      const buttons = await card.locator("button").allTextContents();
      results.check(
        "free: a document whose file was removed offers no download, print, share or replacement",
        (await card.getByTestId("document-purged").count()) === 2 &&
          !buttons.some((label) => /download|print|share|replace|customi[sz]e|again/i.test(label)),
        buttons.join(" | "),
      );
      results.check(
        "free: a voided document whose file was removed says so in the history instead of Download",
        (await card.getByTestId("voided-document").getByTestId("document-purged").count()) === 1 &&
          (await card.getByTestId("voided-document").locator("button").count()) === 0,
      );
    },
    [purgedOrder()],
  );

const checkAutoReceiptLeftOn = (results) =>
  withPlan("free", {}, async (page, state) => {
    const saved = [];
    state.handlers.unshift(async (route, { path, method, body }, json) => {
      if (path !== "/settings/auto-receipt") return false;
      if (method === "POST") saved.push(JSON.parse(body).enabled);
      await json(route, { data: { enabled: method === "GET" } });
      return true;
    });
    await open(page, "/settings?tab=advanced");
    const toggle = page.getByRole("switch");
    results.check(
      "free: automatic receipts left on from a higher plan are marked as not active",
      (await isShown(page, "auto-receipt-inactive")) && (await toggle.getAttribute("aria-checked")) === "true",
    );
    await toggle.click();
    results.check(
      "free: switching automatic receipts off is saved, with no upgrade dialog",
      (await settle(async () => (await toggle.getAttribute("aria-checked")) === "false")) &&
        JSON.stringify(saved) === "[false]" &&
        (await page.getByRole("dialog").count()) === 0,
      JSON.stringify(saved),
    );
  });

// As the API lists them for a Free account: one template of Start and one only Pro has.
const [STANDARD_TEMPLATE] = TEMPLATES;
const LOCKED_TEMPLATES = [
  STANDARD_TEMPLATE,
  { ...STANDARD_TEMPLATE, id: "compact", name: "Compact", locked: true },
  { ...STANDARD_TEMPLATE, id: "dark", name: "Dark", locked: true },
];

const checkTemplateLockNamesItsPlan = (results) =>
  withPlan(
    "free",
    {},
    async (page, state) => {
      state.handlers.unshift(async (route, { path }, json) => {
        if (path !== "/settings/templates") return false;
        await json(route, { data: LOCKED_TEMPLATES });
        return true;
      });
      await open(page, "/settings?tab=documents&section=design");
      await page.getByRole("button", { name: "See template previews" }).click();
      const carousel = page.locator('[aria-labelledby="carousel-dialog-title"]');
      const lock = carousel.getByTestId("carousel-template-lock");
      const lockNameFor = async (templateName) => {
        await carousel.getByRole("button", { name: templateName, exact: true }).click();
        await page.locator("#carousel-dialog-title", { hasText: templateName }).waitFor();
        return (await lock.getAttribute("aria-label")) ?? "";
      };
      const startOnly = await lockNameFor("Compact");
      const proOnly = await lockNameFor("Dark");
      results.check(
        "free, billing on: a Start template is \"Available on Start\", a Pro-only one \"Available on Pro\"",
        /Available on Start$/.test(startOnly) && /Available on Pro$/.test(proOnly),
        `${startOnly} / ${proOnly}`,
      );

      await lock.click();
      const upgrade = page.getByRole("dialog", { name: "Template not in your plan" });
      await upgrade.waitFor();
      const offers = await upgrade.getByRole("button", { name: /upgrade to/i }).allInnerTexts();
      results.check(
        "free, billing on: the dialog for a Pro-only template offers Pro and not Start",
        offers.length === 1 && /Upgrade to Pro/.test(offers[0]),
        offers.join(" | "),
      );
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Escape");
      await upgrade.waitFor({ state: "hidden" });
      results.check(
        "the carousel under the upgrade dialog ignores the arrows, and Escape closes only the dialog",
        (await carousel.isVisible()) && (await page.locator("#carousel-dialog-title").innerText()) === "Dark",
        await page.locator("#carousel-dialog-title").innerText().catch(() => "carousel closed"),
      );
    },
    [],
    { billing: true },
  );

const checkBillingOffLocks = (results) =>
  withPlan("free", {}, async (page) => {
    await open(page, "/suppliers");
    const lock = page.getByTestId("suppliers-create-lock");
    await lock.waitFor();
    const lockName = (await lock.getAttribute("aria-label")) ?? "";
    await lock.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Plan upgrades are not available right now.").waitFor();
    results.check(
      "billing off: a lock names no plan and its dialog has no purchase or portal button",
      /Not included in your current plan/.test(lockName) &&
        (await dialog.getByRole("button", { name: PURCHASE_BUTTONS }).count()) === 0,
      lockName,
    );
  });

const checkUnknownStatusSellsNothing = (results) =>
  withPlan(
    "free",
    {},
    async (page, state) => {
      state.handlers.unshift(async (route, { path, method }, json) => {
        if (path === "/subscription/status") return await json(route, { error: "Boom", errorCode: "INTERNAL_SERVER_ERROR" }, 500), true;
        if (path === "/settings/auto-receipt" && method === "POST")
          return await json(route, { error: "No", errorCode: "PLAN_FEATURE_RESTRICTED", feature: "autoReceipt" }, 402), true;
        return false;
      });
      await open(page, "/settings?tab=advanced");
      results.check("unknown status: nothing is locked", (await page.locator("[data-plan-lock]").count()) === 0);
      // The server refuses the switch, which is the only way to reach the dialog without a status.
      await page.getByRole("switch").click();
      const dialog = page.getByRole("dialog", { name: "Automatic receipts are not in your plan" });
      await dialog.waitFor();
      results.check(
        "unknown status, billing on: the upgrade dialog explains and offers no purchase or portal",
        /could not check your plan/i.test(await dialog.innerText()) &&
          (await dialog.getByRole("button", { name: PURCHASE_BUTTONS }).count()) === 0,
        await dialog.innerText(),
      );
    },
    [],
    { billing: true },
  );

const PERIOD_END = "2026-12-20T10:00:00.000Z";

/** A paying account changes plan, cancels and resumes without leaving the subscription tab. */
const checkSubscriptionManagedInApp = (results) =>
  withPlan(
    "pro",
    {},
    async (page, state) => {
      const paid = (plan, billingStatus) => ({
        ...subscriptionStatusFor(plan),
        billingStatus,
        currentPeriodEnd: PERIOD_END,
        hasBillingSubscription: true,
      });
      let current = paid("pro", "active");
      const posted = [];
      state.handlers.unshift(async (route, { path, method, body }, json) => {
        if (path === "/subscription/status") return await json(route, current), true;
        if (method !== "POST" || !path.startsWith("/subscription/")) return false;
        posted.push(`${path} ${body}`);
        if (path === "/subscription/change-plan") current = paid(JSON.parse(body).plan, "active");
        if (path === "/subscription/cancel") current = paid(current.plan, "scheduled_cancel");
        if (path === "/subscription/resume") current = paid(current.plan, "active");
        return await json(route, current), true;
      });
      const button = (name) => page.getByRole("button", { name, exact: true });
      await open(page, "/settings?tab=subscription");
      await button("Switch to Pro").waitFor();
      results.check(
        "paying on Start: the tab offers Pro, Free and a cancel button, and no link to the provider",
        (await button("Switch to Free").count()) === 1 &&
          (await button("Cancel subscription").count()) === 1 &&
          (await page.getByText(/manage subscription|billing portal/i).count()) === 0,
      );

      await button("Switch to Pro").click();
      const upgrade = page.getByRole("dialog", { name: "Switch to Pro?" });
      await upgrade.waitFor();
      results.check(
        "an upgrade says the saved card is charged now with no payment page, and names the new price",
        /saved card is charged now, without a payment page/i.test(await upgrade.innerText()) &&
          /\$19/.test(await upgrade.innerText()),
        await upgrade.innerText(),
      );
      results.check("nothing is sent before the upgrade is confirmed", posted.length === 0);
      await upgrade.getByRole("button", { name: "Change plan" }).click();
      await button("Switch to Start").waitFor();
      results.check(
        "after the upgrade the message says the saved card was charged",
        await settle(async () => (await page.getByText(/charged to your saved card/i).count()) > 0),
      );
      results.check(
        "the confirmed upgrade posts the stored plan name and the tab follows the answer",
        posted.join("|") === '/subscription/change-plan {"plan":"business"}' &&
          (await button("Switch to Pro").count()) === 0,
        posted.join("|"),
      );

      await button("Switch to Start").click();
      const downgrade = page.getByRole("dialog", { name: "Switch to Start?" });
      await downgrade.waitFor();
      results.check(
        "a downgrade warns that the days left are not refunded",
        /no refund/i.test(await downgrade.innerText()),
        await downgrade.innerText(),
      );
      await downgrade.getByRole("button", { name: "Cancel", exact: true }).click();
      results.check("a dismissed downgrade sends nothing", posted.length === 1);

      await button("Cancel subscription").click();
      const cancel = page.getByRole("dialog", { name: "Cancel the subscription?" });
      await cancel.waitFor();
      results.check(
        "a cancellation says the plan stays until the end of the paid period",
        /keep Pro until/i.test(await cancel.innerText()),
        await cancel.innerText(),
      );
      await cancel.getByRole("button", { name: "Cancel subscription" }).click();
      await button("Resume subscription").waitFor();
      results.check(
        "a scheduled cancellation offers only its undo: no plan switch, no second cancel",
        posted.at(-1).startsWith("/subscription/cancel") &&
          (await page.getByRole("button", { name: /switch to|cancel subscription/i }).count()) === 0,
      );

      await button("Resume subscription").click();
      await button("Cancel subscription").waitFor();
      results.check(
        "resuming brings the plan buttons back",
        posted.at(-1).startsWith("/subscription/resume") && (await button("Switch to Start").count()) === 1,
      );
    },
    [],
    { billing: true },
  );

export const run = async () => {
  const results = new Results("plan gating");
  await checkFreeAnalytics(results);
  await checkFreeHome(results);
  await checkFreeSettings(results);
  await checkFreeLists(results);
  await checkFreeDocumentTypes(results);
  await checkStart(results);
  await checkRefusedCreateKeepsForm(results);
  await checkPurgedDocument(results);
  await checkAutoReceiptLeftOn(results);
  await checkBillingOffLocks(results);
  await checkTemplateLockNamesItsPlan(results);
  await checkUnknownStatusSellsNothing(results);
  await checkSubscriptionManagedInApp(results);
  return results;
};
