// Home dashboard and analytics: a failed request must never read as a zero or as an
// "all good" empty state, loading must not flash or shift the layout, changing the
// period keeps the previous figures on screen, charts speak the data's currency, and
// the controls are touch-sized.

import {
  BASE_URL,
  createState,
  installApiMocks,
  launchBrowser,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 375, height: 800 } };
const TOUCH_TARGET = 44;

const complete = { unknown_cost_lines: 0, unknown_cost_turnover_cents: 0, profit_complete: true };

const BODIES = {
  "total-revenue": { total_revenue_cents: 80000, total_orders: 3, currency: "USD", ...complete },
  "total-turnover": { total_turnover_cents: 105200, total_orders: 3, currency: "USD" },
  "revenue-by-products": [
    { product_id: "p1", product_name: "Beans", total_revenue_cents: 35000000, total_quantity: 9, currency: "USD", ...complete },
    { product_id: "p2", product_name: "Cups", total_revenue_cents: 1200000, total_quantity: 4, currency: "USD", ...complete },
  ],
  "revenue-by-recipients": [
    { recipient_id: "r1", recipient_name: "Alice", total_revenue_cents: 5000, total_orders: 2, currency: "USD", ...complete },
  ],
  "daily-revenue": [
    { date: "2026-10-28", revenue_cents: 1000, turnover_cents: 2000, ...complete },
    { date: "2026-10-29", revenue_cents: 3000, turnover_cents: 5000, ...complete },
  ],
  "status-summary": { draft: 1, confirmed: 1, cancelled: 0 },
  "turnover-by-products": [],
  "turnover-by-recipients": [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Dashboard + low-stock endpoints; `state.fail` and the delays are read per request. */
const mockDashboard = async (page, state) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const isDashboard = path.startsWith("/orders/dashboard/");
    if (state.listDelayMs && ["/products", "/recipients", "/orders"].includes(path)) {
      await sleep(state.listDelayMs);
    }
    if (!isDashboard && path !== "/products/low-stock") return route.fallback();

    state.requests.push(`GET ${path}`);
    if (state.dashboardDelayMs && isDashboard) await sleep(state.dashboardDelayMs);
    if (state.fail) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) });
    }
    const body = isDashboard ? BODIES[path.replace("/orders/dashboard/", "")] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body ?? {}) });
  });
};

const open = async (page, state, path) => {
  page.setDefaultTimeout(9000);
  await installApiMocks(page, state);
  await mockDashboard(page, state);
  await page.goto(`${BASE_URL}${path}`);
};

const newState = (extra = {}) => ({ ...createState(), ...extra });

const mainText = (page) => page.locator("main").innerText();

const analyticsErrors = async (results, name, config) => {
  await withPage(config, async (page) => {
    const state = newState({ fail: true });
    await open(page, state, "/analytics");
    const alert = page.getByRole("alert").filter({ hasText: "Could not load analytics" }).first();
    await alert.waitFor({ timeout: 10000 });
    await settle(async () => (await page.getByRole("alert").count()) >= 4, { timeoutMs: 4000 });
    const text = await mainText(page);
    results.check(
      `${name}: failed analytics show an alert with Retry, KPI shows a dash and no 0,00`,
      (await alert.getByRole("button", { name: "Retry" }).count()) === 1 && text.includes("—") && !/0[,.]00/.test(text) && !text.includes("No data available"),
      JSON.stringify(text.slice(0, 400)),
    );
    state.fail = false;
    await alert.getByRole("button", { name: "Retry" }).click();
    await page.getByRole("alert").getByRole("button", { name: "Retry" }).last().click();
    await page.getByRole("alert").getByRole("button", { name: "Retry" }).last().click();
    await page.getByText("Beans", { exact: true }).first().waitFor();
    results.check(
      `${name}: Retry refetches each failed group and the real figures replace the errors`,
      (await page.getByRole("alert").count()) === 0 && /800/.test(await mainText(page)),
      String(await page.getByRole("alert").count()),
    );
  });
};

const homeErrors = async (results) => {
  await withPage(DESKTOP, async (page) => {
    const state = newState({ fail: true });
    await open(page, state, "/dashboard");
    await page.getByRole("alert").filter({ hasText: "Could not load this section" }).first().waitFor({ timeout: 10000 });
    const text = await mainText(page);
    results.check(
      "home: a failing low-stock request is not reported as 'well-stocked'",
      !text.includes("All products are well-stocked") && !text.includes("No data available"),
      JSON.stringify(text.slice(0, 300)),
    );
    results.check(
      "home: widget failures are covered by the page banner and each widget has a Retry",
      text.includes("Some data could not be loaded") &&
        (await page.getByRole("alert").filter({ hasText: "Could not load this section" }).getByRole("button", { name: "Retry" }).count()) >= 2,
    );
  });
};

const homeErrorRetryTarget = async (results) => {
  await withPage(PHONE, async (page) => {
    const state = newState({ fail: true });
    await open(page, state, "/dashboard");
    const banner = page.getByRole("alert").filter({ hasText: "Some data could not be loaded" });
    await banner.waitFor({ timeout: 10000 });
    const box = await banner.getByRole("button", { name: "Retry" }).boundingBox();
    results.check(
      "home on a phone: the banner's Retry is a 44px target, like each widget's",
      (box?.height ?? 0) >= 44,
      JSON.stringify(box),
    );
  });
};

const homeLoading = async (results, name, config) => {
  await withPage(config, async (page) => {
    const state = newState({ listDelayMs: 1500 });
    await open(page, state, "/dashboard");
    const grid = page.locator("div.grid.grid-cols-2").first();
    await grid.waitFor();
    const productsCard = page.locator("h3", { hasText: "Latest Products" }).locator("xpath=../..");
    await page.waitForTimeout(450);
    const during = (await grid.boundingBox()).height;
    const rows = await productsCard.locator('[data-testid="dashboard-skeleton"] > div > *').count();
    const text = await mainText(page);
    results.check(
      `${name}: loading Latest products shows 5 skeleton rows and no 'No products yet' flash`,
      rows === 5 && !text.includes("No products yet") && !text.includes("Add first product"),
      `rows=${rows}`,
    );
    await page.getByText("Ceramic Pour-Over Dripper").first().waitFor({ timeout: 6000 });
    await page.waitForTimeout(200);
    const after = (await grid.boundingBox()).height;
    results.check(
      `${name}: stat grid keeps its height from skeleton to content (${during} -> ${after})`,
      Math.abs(during - after) <= 2,
    );
  });
};

const rangeChangeKeepsContent = async (results) => {
  await withPage(DESKTOP, async (page) => {
    const state = newState();
    await open(page, state, "/analytics");
    await page.getByText("Beans", { exact: true }).first().waitFor();
    state.dashboardDelayMs = 1800;
    await page.getByRole("button", { name: "7d" }).click();
    await page.waitForTimeout(500);
    const skeletons = await page.locator('[data-testid="dashboard-skeleton"]').count();
    const busy = await page.locator('[aria-busy="true"]').count();
    const cue = await page.getByRole("status").filter({ hasText: "Updating" }).count();
    results.check(
      "changing the preset keeps the old charts and KPI (no skeleton), dimmed with an 'Updating' cue",
      skeletons === 0 && busy === 1 && cue === 1 && /800/.test(await mainText(page)) && (await page.getByText("Beans", { exact: true }).count()) > 0,
      `skeletons=${skeletons} busy=${busy} cue=${cue}`,
    );
    await settle(async () => (await page.locator('[aria-busy="true"]').count()) === 0, { timeoutMs: 6000 });
    results.check(
      "the dimming and cue go away once the new period has loaded",
      (await page.getByRole("status").filter({ hasText: "Updating" }).count()) === 0,
    );
  });
};

const chartUsesDataCurrency = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, newState(), "/analytics");
    await page.getByText("Beans", { exact: true }).first().waitFor();
    const axis = page.locator(".recharts-wrapper").first().locator(".recharts-xAxis-tick-labels text");
    await axis.first().waitFor();
    const ticks = await axis.evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
    const style = await axis.first().evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    results.check(
      "chart axis formats amounts in the data's currency (USD), not the default",
      ticks.length > 0 && ticks.every((tick) => tick.includes("USD")) && !ticks.some((tick) => tick.includes("грн")),
      JSON.stringify(ticks),
    );
    results.check(
      "chart axis ticks use tabular-nums",
      style.includes("tabular-nums"),
      style,
    );
  });
};

const homeNumbersAreTabular = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, newState(), "/dashboard");
    const value = page.locator("p.text-2xl").first();
    await value.waitFor();
    const style = await value.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    results.check("home stat card values use tabular-nums", style.includes("tabular-nums"), style);
  });
};

const touchTargets = async (results) => {
  await withPage(PHONE, async (page) => {
    await open(page, newState(), "/analytics");
    await page.getByText("Beans", { exact: true }).first().waitFor();
    const bar = page.getByRole("button", { name: "Clear" }).locator("xpath=..");
    const barBefore = (await bar.boundingBox()).height;
    const clearDisabled = await page.getByRole("button", { name: "Clear" }).isDisabled();
    const preset = page.getByRole("button", { name: "7d" });
    const heights = [];
    for (const label of ["7d", "30d", "90d", "1y"]) {
      heights.push((await page.getByRole("button", { name: label }).boundingBox()).height);
    }
    const tab = (await page.getByRole("button", { name: "Turnover" }).boundingBox()).height;
    await preset.click();
    const pressed = await preset.getAttribute("aria-pressed");
    const barAfter = (await bar.boundingBox()).height;
    results.check(
      `analytics presets and tabs are >= ${TOUCH_TARGET} px high on touch (${heights.join("/")}, tab ${tab})`,
      heights.every((h) => h >= TOUCH_TARGET - 0.5) && tab >= TOUCH_TARGET - 0.5,
    );
    results.check(
      "presets expose aria-pressed and the filter bar does not grow when dates get set",
      pressed === "true" && clearDisabled && Math.abs(barAfter - barBefore) <= 1,
      `pressed=${pressed} disabled=${clearDisabled} ${barBefore} -> ${barAfter}`,
    );
  });
  await withPage(PHONE, async (page) => {
    await open(page, newState(), "/dashboard");
    const toggle = page.getByRole("button", { name: "30d" });
    await toggle.waitFor();
    const height = (await toggle.boundingBox()).height;
    const qty = page.getByText(/^\d+ pcs$/).first();
    await qty.waitFor();
    const qtyHeight = (await qty.boundingBox()).height;
    results.check(
      "home 7d/30d toggle is touch-sized and the quantity cell stays on one line",
      height >= TOUCH_TARGET - 0.5 && qtyHeight <= 24 && (await toggle.getAttribute("aria-pressed")) !== null,
      `toggle=${height} qty=${qtyHeight}`,
    );
  });
};

const periodLabelIsLocalDay = async (results) => {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: DESKTOP.viewport,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  try {
    const page = await context.newPage();
    await open(page, newState(), "/analytics");
    await page.getByText("Beans", { exact: true }).first().waitFor();
    const inputs = page.locator('input[type="date"]');
    await inputs.nth(0).fill("2026-03-05");
    await inputs.nth(1).fill("2026-03-07");
    const chip = page.locator("main span", { hasText: "3/" }).first();
    await chip.waitFor();
    const label = await chip.innerText();
    results.check(
      "the period label shows the picked calendar days in a negative-UTC zone",
      // The label follows the interface language (English → en-GB), like every other date.
      label.includes("05/03/2026") && label.includes("07/03/2026"),
      label,
    );
  } finally {
    await context.close();
    await browser.close();
  }
};

export const run = async () => {
  const results = new Results("dashboard ui quality");
  await analyticsErrors(results, "desktop", DESKTOP);
  await analyticsErrors(results, "mobile", PHONE);
  await homeErrors(results);
  await homeErrorRetryTarget(results);
  await homeLoading(results, "desktop", DESKTOP);
  await homeLoading(results, "mobile", PHONE);
  await rangeChangeKeepsContent(results);
  await chartUsesDataCurrency(results);
  await homeNumbersAreTabular(results);
  await touchTargets(results);
  await periodLabelIsLocalDay(results);
  return results;
};
