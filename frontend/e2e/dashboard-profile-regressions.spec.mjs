import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { USER, PRODUCTS, makeOrder, paginated } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const EMAIL = "a.long.but.valid.account.identity@example.test";
const CURRENCIES = ["UAH", "USD", "EUR"];
const normalized = (text) => text.replace(/\s+/gu, " ");
const screenshot = async (page, name) => {
  if (!process.env.E2E_SHOT_DIR) return;
  await mkdir(process.env.E2E_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.E2E_SHOT_DIR, name) });
};

const install = async (page, language = "en", theme = "light") => {
  const products = CURRENCIES.map((currency, index) => ({
    ...PRODUCTS[0], id: `currency-product-${index}`, name: `${currency} product`, currency,
    sale_price_cents: 12345,
  }));
  const orders = CURRENCIES.map((currency, index) => ({
    ...makeOrder({ id: `currency-order-${index}`, recipientName: "Customer", orderNumber: index + 1 }),
    currency, total_cents: 6789,
  }));
  const state = createState(orders);
  state.profileEmail = USER.email;
  state.handlers.push(async (route, { path }, json) => {
    if (path === "/auth/profile") { await json(route, { ...USER, email: state.profileEmail }); return true; }
    if (path === "/products") { await json(route, paginated(products)); return true; }
    if (path === "/products/low-stock") { await json(route, []); return true; }
    if (path.startsWith("/orders/dashboard/")) {
      const body = path.endsWith("total-revenue")
        ? { total_revenue_cents: 0, total_orders: 0, currency: "UAH", profit_complete: true }
        : path.endsWith("total-turnover")
          ? { total_turnover_cents: 0, total_orders: 0, currency: "UAH" }
          : path.endsWith("status-summary") ? { draft: 0, confirmed: 3, cancelled: 0 } : [];
      await json(route, body); return true;
    }
    return false;
  });
  await installApiMocks(page, state);
  await page.addInitScript(({ language, theme }) => {
    localStorage.setItem("i18nextLng", language);
    localStorage.setItem("theme", theme);
  }, { language, theme });
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return ["localhost", "127.0.0.1"].includes(host) ? route.fallback() : route.abort();
  });
  return state;
};

export const run = async () => {
  const results = new Results("dashboard-profile-regressions");
  for (const width of [375, 1440]) {
    process.stdout.write(`  checking currency and profile at ${width}px\n`);
    await withPage({ viewport: { width, height: 900 } }, async (page) => {
      const state = await install(page);
      await page.goto(`${BASE_URL}/dashboard`);
      await page.getByText("EUR product", { exact: true }).waitFor();
      const products = page.getByRole("heading", { name: "Latest Products", exact: true }).locator("..").locator("..");
      const orders = page.getByRole("heading", { name: "Latest Orders", exact: true }).locator("..").locator("..");
      for (const [index, currency] of CURRENCIES.entries()) {
        // Use the browser's ICU data: Node and Chrome can use different UAH symbols.
        const expected = await page.evaluate((currency) => {
          const format = (cents) => new Intl.NumberFormat("uk-UA", {
            style: "currency", currency, minimumFractionDigits: 2,
          }).format(cents / 100);
          return { product: format(12345), order: format(6789) };
        }, currency);
        const product = products.getByText(`${currency} product`, { exact: true }).locator("..");
        const order = orders.getByText(`Order #${index + 1}`, { exact: true }).locator("..").locator("..");
        results.check(`${width}px: latest product retains ${currency}`, normalized(await product.innerText()).includes(normalized(expected.product)), await product.innerText());
        results.check(`${width}px: latest order retains ${currency}`, normalized(await order.innerText()).includes(normalized(expected.order)), await order.innerText());
      }
      state.profileEmail = EMAIL;
      await page.goto(`${BASE_URL}/profile`);
      const identity = page.getByRole("heading", { name: EMAIL, exact: true });
      await identity.waitFor();
      const bounds = await identity.evaluate((element) => {
        const text = document.createRange(); text.selectNodeContents(element);
        const rect = text.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, boxLeft: box.left, boxRight: box.right, scroll: element.scrollWidth, client: element.clientWidth };
      });
      results.check(`${width}px: full profile identity stays inside its card`, bounds.left >= bounds.boxLeft - 1 && bounds.right <= bounds.boxRight + 1 && bounds.scroll <= bounds.client + 1, JSON.stringify(bounds));
      results.check(`${width}px: full identity remains accessible`, (await identity.innerText()) === EMAIL, await identity.innerText());
      await screenshot(page, `profile-identity-${width}.png`);
    });
  }
  for (const language of ["en", "ru", "uk"]) {
    for (const theme of ["light", "dark"]) {
      process.stdout.write(`  checking dashboard at 320px ${language} ${theme}\n`);
      await withPage({ viewport: { width: 320, height: 812 } }, async (page) => {
        await install(page, language, theme);
        page.setDefaultTimeout(10000);
        await page.goto(`${BASE_URL}/dashboard`);
        await page.getByText("EUR product", { exact: true }).waitFor();
        const bounds = await page.locator('main a[href="/orders"]').nth(1).evaluate((element) => {
          const label = element.querySelector("p");
          const range = document.createRange(); range.selectNodeContents(label);
          const box = element.getBoundingClientRect();
          const text = range.getBoundingClientRect();
          return { cardLeft: box.left, cardRight: box.right, textLeft: text.left, textRight: text.right,
            scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth };
        });
        results.check(`320px ${language} ${theme}: Documents label fits without horizontal overflow`, bounds.textLeft >= bounds.cardLeft && bounds.textRight <= bounds.cardRight + 1 && bounds.scroll <= bounds.width + 1, JSON.stringify(bounds));
        await screenshot(page, `dashboard-320-${language}-${theme}.png`);
      });
    }
  }
  for (const width of [320, 375, 1024, 1280, 1440]) {
   for (const language of ["en", "ru", "uk"]) {
    await withPage({ viewport: { width, height: 812 } }, async (page) => {
      await install(page, language);
      page.setDefaultTimeout(10000);
      let release;
      const listsReady = new Promise((resolve) => { release = resolve; });
      await page.route("**/api/v1/**", async (route) => {
        const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
        if (["/products", "/recipients", "/orders", "/receipts"].includes(path)) await listsReady;
        return route.fallback();
      });
      try {
        await page.goto(`${BASE_URL}/dashboard`);
        const grid = page.locator("main div.grid.grid-cols-2").first();
        await grid.getByTestId("dashboard-skeleton").first().waitFor({ state: "visible" });
        const loadingHeight = (await grid.boundingBox()).height;
        const loadingCards = await grid.locator('[data-testid="dashboard-skeleton"] > div').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
        const loadingBounds = await grid.evaluate((element) => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          cards: [...element.querySelectorAll('[data-testid="dashboard-skeleton"] > div')].map((card) => ({
            width: card.clientWidth, scroll: card.scrollWidth,
            overflowing: [...card.querySelectorAll("*")].filter((child) => {
              const box = child.getBoundingClientRect();
              return box.width > 0 && box.right > card.getBoundingClientRect().right + 1;
            }).map((child) => ({ className: child.className, right: child.getBoundingClientRect().right })),
          })),
        }));
        results.check(`${width}px ${language}: loading skeletons fit without horizontal overflow`,
          loadingBounds.document <= loadingBounds.viewport + 1 && loadingBounds.cards.every((card) => card.scroll <= card.width + 1 && card.overflowing.length === 0),
          JSON.stringify(loadingBounds));
        if (width === 320 && language === "en") await screenshot(page, "dashboard-loading-320.png");
        release();
        await grid.locator("a").first().waitFor();
        const loadedHeight = (await grid.boundingBox()).height;
        const loadedCards = await grid.locator("a > div").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
        const geometry = await grid.locator("a > div").evaluateAll((cards) => cards.map((card) => {
          const label = card.querySelector("p");
          const range = document.createRange(); range.selectNodeContents(label);
          const text = range.getBoundingClientRect();
          const box = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          const iconDisplay = getComputedStyle(card.firstElementChild.firstElementChild).display;
          const labelMargin = parseFloat(getComputedStyle(label.parentElement).marginLeft);
          const contentWidth = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          const threshold = 10 * parseFloat(getComputedStyle(document.documentElement).fontSize);
          return {
            contentWidth, iconDisplay, labelMargin, containerType: style.containerType,
            fullLabel: text.left >= box.left && text.right <= box.right && label.scrollWidth <= label.clientWidth + 1,
            viewportFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            responsiveIcon: contentWidth >= threshold ? iconDisplay !== "none" : iconDisplay === "none",
            responsiveMargin: labelMargin === (contentWidth >= threshold ? threshold / 10 : 0),
          };
        }));
        const expectedCards = (cards) => cards.length === 4 && cards.every((height) => height === 102);
        const expectedHeight = width < 1024 ? 216 : 102;
        results.check(`${width}px ${language}: held lists keep the ${expectedHeight}px stat grid and 102px cards`,
          loadingHeight === expectedHeight && loadedHeight === loadingHeight && expectedCards(loadingCards) && expectedCards(loadedCards),
          JSON.stringify({ loadingHeight, loadedHeight, loadingCards, loadedCards }));
        results.check(`${width}px ${language}: available card width controls icons and preserves full labels`,
          geometry.every((card) => card.containerType === "inline-size" && card.fullLabel && card.viewportFits && card.responsiveIcon && card.responsiveMargin), JSON.stringify(geometry));
        process.stdout.write(`  geometry ${width}px ${language}: ${JSON.stringify(geometry)}\n`);
      } finally {
        release();
      }
    });
  }
  }
  return results;
};
