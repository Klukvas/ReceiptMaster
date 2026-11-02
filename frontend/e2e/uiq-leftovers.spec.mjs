// UI quality leftovers: offline banner, in-app 404, menu semantics, collapsed-sidebar
// switchers, delayed route fallback, one toast per failure, stable skeleton and sparkline
// error layouts, and the one-time reset of stale product column choices.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const FAILURE_MESSAGE = "Confirm exploded";
const TOP_LIST_ROWS = 10;

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const open = async (page, path, { orders } = {}) => {
  page.setDefaultTimeout(8000);
  await installApiMocks(page, createState(orders ?? []));
  await page.goto(`${BASE_URL}${path}`);
};

const offlineBanner = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, "/dashboard");
    await page.locator("#app-sidebar").waitFor();
    const banner = page.getByRole("status").filter({ hasText: "No internet connection" });
    results.check("online: no offline banner", (await banner.count()) === 0);

    await page.context().setOffline(true);
    await banner.waitFor();
    const text = await banner.innerText();
    results.check(
      "offline: a status banner says loaded data is readable and changes cannot be saved",
      /already loaded/.test(text) && /cannot be saved/.test(text),
      text,
    );
    await page.context().setOffline(false);
    await banner.waitFor({ state: "detached" });
    results.check("back online: the banner goes away", true);
  });
};

const notFoundInShell = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, "/definitely-not-here");
    await page.getByRole("heading", { name: "Page Not Found" }).waitFor();
    results.check(
      "signed in: an unknown URL renders the 404 inside the app shell (sidebar kept)",
      (await page.locator("#app-sidebar").count()) === 1,
    );
    await page.getByRole("button", { name: "Go to Dashboard" }).click();
    await page.waitForURL("**/dashboard");
    results.check("the 404 offers a way back to the dashboard", true);
  });

  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.goto(`${BASE_URL}/definitely-not-here`);
    await page.getByRole("heading", { name: "Page Not Found" }).waitFor();
    results.check(
      "signed out: the public 404 stays standalone",
      (await page.locator("#app-sidebar").count()) === 0 &&
        (await page.getByRole("button", { name: "Go Home" }).count()) === 1,
    );
  });
};

const menuSemantics = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, "/products");
    const trigger = page.getByRole("button", { name: "Actions" }).first();
    await trigger.waitFor();
    const closed = await trigger.evaluate((el) => ({
      popup: el.getAttribute("aria-haspopup"),
      expanded: el.getAttribute("aria-expanded"),
    }));
    await trigger.click();
    const menu = page.getByRole("menu");
    await menu.waitFor();
    const items = menu.getByRole("menuitem");
    const count = await items.count();
    const firstFocused = await items.first().evaluate((el) => el === document.activeElement);
    results.check(
      "trigger has aria-haspopup=menu and aria-expanded; menu opens with role=menu items, first focused",
      closed.popup === "menu" &&
        closed.expanded === "false" &&
        (await trigger.getAttribute("aria-expanded")) === "true" &&
        count >= 2 &&
        firstFocused,
      JSON.stringify({ closed, count, firstFocused }),
    );

    await page.keyboard.press("ArrowDown");
    const second = await items.nth(1).evaluate((el) => el === document.activeElement);
    await page.keyboard.press("End");
    const last = await items.nth(count - 1).evaluate((el) => el === document.activeElement);
    await page.keyboard.press("Home");
    const home = await items.first().evaluate((el) => el === document.activeElement);
    await page.keyboard.press("ArrowUp");
    const wrapped = await items.nth(count - 1).evaluate((el) => el === document.activeElement);
    results.check(
      "Arrow Up/Down, Home and End move focus between menu items",
      second && last && home && wrapped,
      JSON.stringify({ second, last, home, wrapped }),
    );

    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    results.check(
      "Escape closes the menu and returns focus to the trigger",
      await trigger.evaluate((el) => el === document.activeElement),
    );
  });
};

const collapsedSwitchers = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, "/dashboard");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    const theme = page.locator("#app-sidebar").getByRole("button", { name: "Toggle theme" });
    const language = page.locator("#app-sidebar").getByRole("button", { name: /^Language: English/ });
    await theme.waitFor();
    results.check(
      "collapsed sidebar keeps labelled theme and language buttons with tooltips",
      (await theme.getAttribute("title")) === "Toggle theme" &&
        (await language.getAttribute("title"))?.startsWith("Language:"),
    );
    await theme.focus();
    await page.keyboard.press("Tab");
    results.check(
      "the language button is next in Tab order after the theme button",
      await language.evaluate((el) => el === document.activeElement),
    );
    const wasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await theme.click();
    results.check(
      "the compact theme button switches the theme",
      (await page.evaluate(() => document.documentElement.classList.contains("dark"))) !== wasDark,
    );
    await language.click();
    await page.locator("#app-sidebar").getByRole("button", { name: /Русский/ }).waitFor();
    results.check("the compact language button switches to the next language", true);
  });
};

const routeFallback = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(8000);
    await installApiMocks(page, createState());
    await page.route("**/src/pages/OrdersPage*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.goto(`${BASE_URL}/dashboard`);
    await page.locator("#app-sidebar").waitFor();
    await page.getByRole("link", { name: "Orders" }).first().click();
    const fastSpinner = await page.locator("main [role=status] .animate-spin").count();
    await page.waitForTimeout(400);
    const status = page.locator("main").getByRole("status").filter({ hasText: "Loading" });
    results.check(
      "a slow route chunk loads inside the shell: status region with text, spinner only after the delay",
      fastSpinner === 0 &&
        (await status.count()) === 1 &&
        (await page.locator("#app-sidebar").isVisible()),
      `fastSpinner=${fastSpinner}`,
    );
  });
};

const singleErrorToast = async (results) => {
  await withPage(DESKTOP, async (page) => {
    const draft = {
      ...makeOrder({ id: "d1-0000-4000-8000-000000000000", recipientName: "Buyer 1" }),
      status: "draft",
    };
    await open(page, "/orders", { orders: [draft] });
    await page.route("**/api/v1/settings/auto-receipt*", (route) => json(route, { data: { enabled: false } }));
    await page.route("**/api/v1/orders/*/confirm", (route) =>
      json(route, { error: FAILURE_MESSAGE, errorCode: "INTERNAL_ERROR" }, 500),
    );
    await page.getByText("Buyer 1").first().waitFor({ state: "attached" });
    await page.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: /confirm/i }).click();
    await page.getByText(FAILURE_MESSAGE).first().waitFor();
    await page.waitForTimeout(800);
    results.check(
      "a 500 on Confirm shows exactly one toast",
      (await page.getByText(FAILURE_MESSAGE).count()) === 1,
      `${await page.getByText(FAILURE_MESSAGE).count()} elements`,
    );
  });
};

const topListSkeleton = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(8000);
    await installApiMocks(page, createState());
    await page.route("**/orders/dashboard/revenue-by-recipients*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await json(route, []);
    });
    await page.goto(`${BASE_URL}/analytics`);
    await page.waitForTimeout(700);
    const rows = await page.locator(".divide-transparent > div").count();
    results.check(
      "the top-recipients skeleton has as many rows as the loaded list shows",
      rows === TOP_LIST_ROWS,
      `rows=${rows}`,
    );
  });
};

const sparklineErrorKeepsToggle = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(8000);
    await installApiMocks(page, createState());
    await page.route("**/orders/dashboard/daily-revenue*", (route) => json(route, { error: "boom" }, 500));
    await page.goto(`${BASE_URL}/dashboard`);
    const heading = page.getByRole("heading", { name: "Profit Over Time" });
    await heading.waitFor({ timeout: 15000 });
    const card = heading.locator("xpath=ancestor::div[contains(@class,'mb-4')][1]/..");
    await card.getByRole("button", { name: "Retry" }).waitFor({ timeout: 15000 });
    results.check(
      "the sparkline error state keeps the 7d/30d toggle beside Retry",
      (await card.getByRole("button", { name: "7d" }).count()) === 1 &&
        (await card.getByRole("button", { name: "30d" }).count()) === 1,
    );
  });
};

const staleColumnChoice = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(8000);
    await installApiMocks(page, createState());
    await page.addInitScript(() => {
      localStorage.setItem("products_columns", JSON.stringify({ currency: true }));
    });
    await page.goto(`${BASE_URL}/products`);
    await page.getByRole("columnheader").first().waitFor();
    const headers = await page.getByRole("columnheader").allInnerTexts();
    results.check(
      "a column choice saved before the currency column became optional no longer shows it",
      !headers.some((header) => header.trim() === "Currency"),
      JSON.stringify(headers),
    );
  });
};

export const run = async () => {
  const results = new Results("ui quality leftovers");
  await offlineBanner(results);
  await notFoundInShell(results);
  await menuSemantics(results);
  await collapsedSwitchers(results);
  await routeFallback(results);
  await singleErrorToast(results);
  await topListSkeleton(results);
  await sparklineErrorKeepsToggle(results);
  await staleColumnChoice(results);
  return results;
};
