// The product form against a mocked API whose stock moved while the form was
// open: the list (and so the form) shows 10, an order has since made it 8.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { paginated } from "./support/fixtures.mjs";
import { Results, waitFor } from "./support/runner.mjs";

const LISTED = {
  id: "product-stock",
  name: "Arabica beans 1kg",
  purchase_price_cents: 1400,
  sale_price_cents: 2600,
  quantity: 10,
  currency: "UAH",
  supplier_id: null,
  created_at: "2026-01-02T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};
const AFTER_ORDER = { ...LISTED, quantity: 8 };
const CONFLICT = {
  error: "Stock of product product-stock changed since it was loaded; nothing was saved",
  errorCode: "PRODUCT_QUANTITY_CONFLICT",
};

const setup = async (page, answerPatch) => {
  page.setDefaultTimeout(5000);
  await installApiMocks(page, createState());
  const calls = [];
  // Registered last, so it takes precedence for product routes.
  await page.route("**/api/v1/products**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const method = request.method();
    const send = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    calls.push({ method, path, body: request.postDataJSON?.() ?? null });
    if (path === "/products/stock-value")
      return send({
        currency: "UAH",
        purchaseValueCents: 0,
        saleValueCents: 0,
        totalUnits: 0,
        productCount: 1,
      });
    if (path === "/products" && method === "GET")
      return send(paginated([LISTED]));
    if (path === `/products/${LISTED.id}` && method === "GET")
      return send(AFTER_ORDER);
    if (path === `/products/${LISTED.id}` && method === "PATCH")
      return answerPatch(request.postDataJSON(), send, calls);
    return route.fallback();
  });
  await page.goto(`${BASE_URL}/products`);
  await page.getByTitle("Actions").first().click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("heading", { name: "Edit Product" }).waitFor();
  return calls;
};

const patches = (calls) => calls.filter((call) => call.method === "PATCH");

const renameSendsOnlyTheName = async (results) => {
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    const calls = await setup(page, (body, send) =>
      send({ ...AFTER_ORDER, ...body }),
    );
    await page.getByLabel("Product Name").fill("Arabica beans 1kg (roasted)");
    await page.getByRole("button", { name: "Save" }).click();
    const closed = await page
      .getByRole("heading", { name: "Edit Product" })
      .waitFor({ state: "detached" })
      .then(() => true)
      .catch(() => false);
    const [patch] = patches(calls);
    results.check(
      "rename: PATCH body is exactly the new name (no quantity)",
      patches(calls).length === 1 &&
        JSON.stringify(patch.body) ===
          JSON.stringify({ name: "Arabica beans 1kg (roasted)" }),
      JSON.stringify(patches(calls)),
    );
    results.check("rename: the form closes after saving", closed);
  });
};

const staleQuantityKeepsInput = async (results) => {
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    const calls = await setup(page, (body, send) =>
      body.expectedQuantity === AFTER_ORDER.quantity
        ? send({ ...AFTER_ORDER, ...body, expectedQuantity: undefined })
        : send(CONFLICT, 409),
    );
    await page.getByLabel("Product Name").fill("Arabica beans 1kg — new lot");
    await page.getByLabel("Quantity").fill("15");
    await page.getByRole("button", { name: "Save" }).click();

    const notice = page.getByTestId("quantity-conflict");
    const noticeShown = await notice
      .waitFor()
      .then(() => true)
      .catch(() => false);
    const [first] = patches(calls);
    results.check(
      "conflict: the stale edit sent quantity with the loaded stock as expectedQuantity",
      first?.body?.quantity === 15 && first?.body?.expectedQuantity === 10,
      JSON.stringify(first),
    );
    const text = noticeShown ? await notice.innerText() : "";
    results.check(
      "conflict: the form shows the server's stock (8) and the unsaved 15",
      noticeShown && /\b8\b/.test(text) && /\b15\b/.test(text),
      text,
    );
    results.check(
      "conflict: the form stays open with every typed value",
      (await page.getByRole("heading", { name: "Edit Product" }).isVisible()) &&
        (await page.getByLabel("Product Name").inputValue()) ===
          "Arabica beans 1kg — new lot" &&
        (await page.getByLabel("Quantity").inputValue()) === "15",
    );
    results.check(
      "conflict: the current product was reloaded",
      calls.some(
        (call) => call.method === "GET" && call.path === `/products/${LISTED.id}`,
      ),
      JSON.stringify(calls),
    );

    await page.getByRole("button", { name: "Save" }).click();
    await waitFor(() => patches(calls).length === 2, {
      label: "the informed second save",
    }).catch(() => undefined);
    const second = patches(calls)[1];
    results.check(
      "conflict: saving again is an informed overwrite against 8",
      second?.body?.quantity === 15 && second?.body?.expectedQuantity === 8,
      JSON.stringify(second),
    );
  });
};

export const run = async () => {
  const results = new Results("product form conflict");
  await renameSendsOnlyTheName(results);
  await staleQuantityKeepsInput(results);
  return results;
};
