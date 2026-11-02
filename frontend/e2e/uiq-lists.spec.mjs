// List quality (shared DataTable + products): idempotent create, dialog fits a short
// viewport, no hidden row actions at 1280, skeleton without layout jump, phone selection,
// product cards, offline notice and empty/error states. The API is mocked.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 375, height: 700 } };
const SHORT_PHONE = { viewport: { width: 375, height: 500 } };
const TOTAL_PRODUCTS = 25;
const PAGE_SIZE = 10;

const makeProduct = (index) => ({
  id: `product-${index}`,
  name: `Product number ${index}`,
  purchase_price_cents: 1000 + index,
  sale_price_cents: 2000 + index,
  quantity: 3 + index,
  currency: "UAH",
  supplier_id: null,
  created_at: "2026-01-02T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
});
const PRODUCT_PAGE = Array.from({ length: PAGE_SIZE }, (_, i) => makeProduct(i + 1));

const firstProduct = (page) =>
  page.getByText("Product number 1", { exact: true }).locator("visible=true");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mocks the products endpoints; `options` can delay or fail the list, or script POSTs. */
const mockProducts = async (page, options = {}) => {
  const posts = [];
  await page.route("**/api/v1/products**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/products/stock-value") return json({ productCount: 0 });
    if (path === "/products" && request.method() === "POST") {
      posts.push({ key: request.headers()["idempotency-key"], body: request.postDataJSON() });
      return options.onPost ? options.onPost(route, posts.length, json) : json(makeProduct(99), 201);
    }
    if (path === "/products" && request.method() === "GET") {
      if (options.listDelayMs) await sleep(options.listDelayMs);
      if (options.listError) return json({}, 500);
      const search = url.searchParams.get("search");
      if (search) return json({ data: [], total: 0, offset: 0, limit: PAGE_SIZE });
      return json({ data: PRODUCT_PAGE, total: TOTAL_PRODUCTS, offset: 0, limit: PAGE_SIZE });
    }
    return route.fallback();
  });
  return posts;
};

const setup = async (page, options) => {
  page.setDefaultTimeout(6000);
  await installApiMocks(page, createState());
  return mockProducts(page, options);
};

const fillProductForm = async (page) => {
  await page.getByLabel("Product Name").fill("Retry bean");
  await page.getByLabel("Purchase Price").fill("10");
  await page.getByLabel("Sale Price").fill("20");
  await page.getByLabel("Quantity").fill("5");
};

const openCreateDialog = async (page) => {
  await page.getByRole("button", { name: "Create Product" }).first().click();
  await page.getByRole("dialog").getByLabel("Product Name").waitFor();
};

const idempotentCreate = async (results) => {
  await withPage(DESKTOP, async (page) => {
    const posts = await setup(page, {
      onPost: (route, count, json) =>
        count === 1 ? route.abort("timedout") : json(makeProduct(99), 201),
    });
    await page.goto(`${BASE_URL}/products`);
    await openCreateDialog(page);
    await fillProductForm(page);
    const submit = page.getByRole("dialog").getByRole("button", { name: "Create", exact: true });
    await submit.click();
    await page.getByRole("dialog").getByText(/network|error/i).first().waitFor();
    await submit.click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    results.check(
      "create product: a retry after a lost response reuses the Idempotency-Key",
      posts.length === 2 && !!posts[0].key && posts[0].key === posts[1].key,
      JSON.stringify(posts.map((post) => post.key)),
    );
  });

  await withPage(DESKTOP, async (page) => {
    const posts = await setup(page, {
      onPost: async (route, _count, json) => {
        await sleep(600);
        return json(makeProduct(99), 201);
      },
    });
    await page.goto(`${BASE_URL}/products`);
    await openCreateDialog(page);
    await fillProductForm(page);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create", exact: true })
      .dblclick();
    await sleep(900);
    results.check("create product: a double click sends one POST", posts.length === 1, `${posts.length}`);
  });
};

const dialogFitsShortViewport = async (results) => {
  await withPage(SHORT_PHONE, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/products`);
    await openCreateDialog(page);
    await page.waitForTimeout(400);
    const { top, bottom, scrolls } = await page.getByRole("dialog").locator("> div").evaluate((card) => {
      const rect = card.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        scrolls: getComputedStyle(card).overflowY === "auto" && card.scrollHeight > card.clientHeight,
      };
    });
    results.check(
      "product dialog stays inside a 375x500 viewport and scrolls inside",
      top >= 0 && bottom <= 500 && scrolls,
      JSON.stringify({ top, bottom, scrolls }),
    );
  });
};

const LANGUAGES = ["en", "ru", "uk"];

const actionsVisibleAt1280 = async (results) => {
  for (const language of LANGUAGES) {
    await withPage(DESKTOP, async (page) => {
      await setup(page);
      await page.addInitScript((lng) => localStorage.setItem("i18nextLng", lng), language);
      await page.goto(`${BASE_URL}/products`);
      const actions = page.locator("tbody tr button[aria-haspopup], tbody tr button[title]").first();
      await actions.waitFor();
      const fit = await actions.evaluate((button) => {
        const scroller = button.closest(".overflow-x-auto");
        return {
          buttonRight: button.getBoundingClientRect().right,
          scrollerRight: scroller.getBoundingClientRect().right,
          overflow: scroller.scrollWidth - scroller.clientWidth,
        };
      });
      results.check(
        `products table at 1280 (${language}): row actions need no horizontal scroll`,
        fit.overflow <= 0 && fit.buttonRight <= fit.scrollerRight,
        JSON.stringify(fit),
      );
    });
  }
};

const tableHeight = (page) =>
  page.locator("table").first().evaluate((table) => table.getBoundingClientRect().height);

const skeletonWithoutJump = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await setup(page, { listDelayMs: 1500 });
    const startedAt = Date.now();
    await page.goto(`${BASE_URL}/products`);
    await page.locator("table").first().waitFor();
    const skeletonRows = page.locator("tbody tr[aria-hidden='true']");
    const earlyVisible = await skeletonRows.first().isVisible();
    // A slow machine can take longer than the delay just to reach this point; only trust the
    // "hidden at first" reading when it was taken inside the delay window.
    const tookTooLong = Date.now() - startedAt > 150;
    await page.waitForTimeout(400);
    const lateVisible = await skeletonRows.first().isVisible();
    const rowCount = await skeletonRows.count();
    const loadingHeight = await tableHeight(page);
    results.check(
      "table skeleton: hidden for the first ~200 ms, then 10 skeleton rows",
      (tookTooLong || !earlyVisible) && lateVisible && rowCount === PAGE_SIZE,
      JSON.stringify({ earlyVisible, lateVisible, rowCount }),
    );
    await firstProduct(page).waitFor();
    const loadedHeight = await tableHeight(page);
    results.check(
      "table skeleton: the loaded table is the same height (no layout jump)",
      Math.abs(loadedHeight - loadingHeight) <= 6,
      `${loadingHeight} -> ${loadedHeight}`,
    );
  });
};

const phoneSelection = async (results) => {
  await withPage(PHONE, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/products`);
    await firstProduct(page).waitFor();
    const box = await page
      .getByRole("checkbox", { name: "Select Product number 1", exact: true })
      .evaluate((input) => {
        const rect = input.closest("label").getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
    results.check(
      "phone cards: each card has a selection checkbox with a >= 44 px hit box",
      box.width >= 44 && box.height >= 44,
      JSON.stringify(box),
    );
    await page.getByRole("checkbox", { name: "Select all on this page" }).check();
    const checked = await page.getByRole("checkbox", { name: /^Select Product number/ }).evaluateAll(
      (inputs) => inputs.filter((input) => input.checked).length,
    );
    const bar = page.getByRole("status").filter({ hasText: "selected" });
    results.check(
      "phone cards: Select all on this page selects every card and shows the count",
      checked === PAGE_SIZE && (await bar.innerText()).includes(`${PAGE_SIZE}`),
      `${checked}`,
    );
  });

  await withPage(PHONE, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/products`);
    await page.getByRole("button", { name: /Product number 2/ }).click();
    const drawer = page.getByRole("dialog", { name: "Product number 2" });
    const opened = await drawer.waitFor().then(() => true, () => false);
    results.check("phone product card: tapping the card opens the product drawer", opened);
  });
};

const offlineNotice = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/products`);
    await firstProduct(page).waitFor();
    await page.context().setOffline(true);
    await page.getByPlaceholder(/search/i).fill("beans");
    const notice = page.getByRole("status").filter({ hasText: "You are offline" });
    const shown = await notice.waitFor().then(() => true, () => false);
    const hasRetry = shown && (await notice.getByRole("button", { name: "Retry" }).count()) === 1;
    await page.context().setOffline(false);
    const cleared = await notice.waitFor({ state: "detached" }).then(() => true, () => false);
    results.check("offline search: an inline status with Retry appears", shown && hasRetry);
    results.check("offline search: the notice clears when back online", cleared);
  });
};

const emptyAndErrorStates = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/products`);
    await firstProduct(page).waitFor();
    const search = page.getByPlaceholder(/search/i);
    await search.fill("zzz");
    const clear = page.getByRole("button", { name: "Clear search" }).last();
    const shown = await clear.waitFor().then(() => true, () => false);
    if (shown) await clear.click();
    const searchEmpty = (await search.inputValue()) === "";
    results.check("zero-result search offers Clear search, which empties the search box", shown && searchEmpty);
  });

  await withPage(DESKTOP, async (page) => {
    await setup(page, { listError: true });
    await page.goto(`${BASE_URL}/products`);
    const alert = page.getByRole("alert");
    await alert.waitFor();
    const text = await alert.innerText();
    const tableVisible = await page.locator("table").first().isVisible();
    results.check(
      "list error without a code: friendly text, Retry, and no empty-header table",
      !/status code/i.test(text) && !tableVisible && (await alert.getByRole("button", { name: "Retry" }).count()) === 1,
      JSON.stringify({ text, tableVisible }),
    );
  });
};

export const run = async () => {
  const results = new Results("lists");
  await idempotentCreate(results);
  await dialogFitsShortViewport(results);
  await actionsVisibleAt1280(results);
  await skeletonWithoutJump(results);
  await phoneSelection(results);
  await offlineNotice(results);
  await emptyAndErrorStates(results);
  return results;
};
