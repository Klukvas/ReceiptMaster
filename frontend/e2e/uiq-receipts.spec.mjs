// Public receipt page and receipt sharing: a visible skeleton in the final layout, honest
// error states (only 404/410 mean "not found"), a stable download button, and feedback
// when the clipboard is unavailable.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 375, height: 812 } };
const SLOW_MS = 2500;
const SIZE_TOLERANCE_PX = 12;

const json = (route, status, body) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const RECEIPT = {
  money: true,
  documentLanguage: "en",
  formatting: { dateFormat: "numeric", numberFormat: "en-US", timeZone: "Europe/Kyiv" },
  receipt: {
    id: "r1",
    number: "2026-000001",
    created_at: "2026-10-28T10:00:00.000Z",
    order: {
      id: "o1",
      currency: "USD",
      subtotal_cents: 4500,
      total_cents: 4500,
      items: [1, 2, 3].map((n) => ({
        id: `i${n}`,
        product_name: `Item ${n}`,
        qty: n,
        unit_price_cents: 500,
        line_total_cents: 500 * n,
      })),
    },
  },
  companyInfo: { companyName: "Walk Test Co" },
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const boxHeight = async (locator) => (await locator.boundingBox())?.height ?? 0;

const slowSkeleton = async (results, label, options) => {
  await withPage(options, async (page) => {
    page.setDefaultTimeout(8000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/public/receipts/tok", async (route) => {
      await delay(SLOW_MS);
      return json(route, 200, RECEIPT);
    });
    await page.goto(`${BASE_URL}/r/tok`, { waitUntil: "commit" });
    await page.locator('[aria-busy="true"] .animate-pulse').first().waitFor();
    const skeleton = page.locator('[aria-busy="true"] > div');
    const skeletonHeight = (await skeleton.count()) ? await boxHeight(skeleton.first()) : 0;
    const blockColor = await page
      .locator('[aria-busy="true"] .animate-pulse')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
      .catch(() => "");
    const pageColor = await page.evaluate(
      () => getComputedStyle(document.querySelector('[aria-busy="true"]')).backgroundColor,
    ).catch(() => "");
    results.check(
      `${label}: slow load shows a skeleton whose blocks differ from the page tone`,
      skeletonHeight > 300 && blockColor !== "" && blockColor !== pageColor,
      `height=${skeletonHeight} block=${blockColor} page=${pageColor}`,
    );
    await page.getByRole("button", { name: "Download PDF" }).waitFor();
    const loadedHeight = await boxHeight(page.locator("div.max-w-2xl").first());
    results.check(
      `${label}: skeleton height matches the loaded page`,
      Math.abs(skeletonHeight - loadedHeight) <= SIZE_TOLERANCE_PX,
      `skeleton=${skeletonHeight} loaded=${loadedHeight}`,
    );
  });
};

const errorStates = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/public/receipts/gone", (route) => json(route, 404, {}));
    await page.goto(`${BASE_URL}/r/gone`);
    await page.getByText("Document Not Found").waitFor();
    results.check(
      "404 shows not-found without a Retry button",
      (await page.getByRole("button", { name: "Retry" }).count()) === 0,
    );
  });

  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    let isFailing = true;
    let successfulLoads = 0;
    await page.route("**/api/v1/public/receipts/flaky", (route) => {
      if (isFailing) return json(route, 500, {});
      successfulLoads += 1;
      return json(route, 200, RECEIPT);
    });
    await page.goto(`${BASE_URL}/r/flaky`);
    await page.getByText("Could not load this document").waitFor();
    results.check(
      "500 shows the retry message, not 'revoked'",
      !(await page.locator("body").innerText()).includes("revoked"),
    );
    isFailing = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByRole("button", { name: "Download PDF" }).waitFor();
    results.check("Retry reloads the receipt", successfulLoads >= 1);
  });

  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/public/receipts/offline", (route) => route.abort("connectionfailed"));
    await page.goto(`${BASE_URL}/r/offline`);
    await page.getByText("Could not load this document").waitFor();
    results.check(
      "a network failure offers Retry",
      (await page.getByRole("button", { name: "Retry" }).count()) === 1,
    );
  });
};

const downloadButton = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/public/receipts/tok", (route) => json(route, 200, RECEIPT));
    await page.route("**/api/v1/public/receipts/tok/pdf", async (route) => {
      await delay(SLOW_MS);
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4" });
    });
    await page.goto(`${BASE_URL}/r/tok`);
    const button = page.getByRole("button", { name: "Download PDF" });
    await button.waitFor();
    const before = (await button.boundingBox()).width;
    const number = page.getByText("#2026-000001");
    results.check(
      "the receipt number uses tabular numbers",
      (await number.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).includes("tabular-nums"),
    );
    await button.click();
    await page.waitForTimeout(300);
    const after = (await button.boundingBox()).width;
    results.check(
      "the download button keeps its width and is marked busy while downloading",
      Math.abs(before - after) < 2 && (await button.getAttribute("aria-busy")) === "true",
      `before=${before} after=${after}`,
    );
  });
};

const clipboardFailure = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(8000);
    await installApiMocks(page, createState([
      makeOrder({ id: "o1", receiptId: "rcp-1", receiptStatus: "generated", recipientName: "Buyer" }),
    ]));
    await page.route("**/api/v1/receipts/rcp-1/share", (route) =>
      json(route, 200, { url: "https://example.test/r/abc" }),
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("denied")) },
        configurable: true,
      });
    });
    await page.goto(`${BASE_URL}/orders`);
    await page.getByText("Buyer").first().click();
    // The waybill card in the order details; the footer repeats its actions.
    await page.getByTestId("document-card").first().getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog.getByRole("button", { name: /Copy/ }).click();
    const alertCount = await dialog.getByRole("alert").count();
    results.check("a failed clipboard write shows an error in the share dialog", alertCount === 1);
    results.check(
      "the link field is selectable for manual copy",
      (await dialog.locator("input[readonly]").count()) === 1,
    );
  });
};

export const run = async () => {
  const results = new Results("receipts ui quality");
  await slowSkeleton(results, "desktop", DESKTOP);
  await slowSkeleton(results, "phone", PHONE);
  await errorStates(results);
  await downloadButton(results);
  await clipboardFailure(results);
  return results;
};
