// Browser Back closes the topmost dialog instead of leaving the page, and a normal close
// leaves no dead history entry behind.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results, settle } from "./support/runner.mjs";

const VIEWPORT = { viewport: { width: 1280, height: 900 } };
const ORDER_ID = "o1-0000-4000-8000-000000000000";

const setup = async (page) => {
  page.setDefaultTimeout(6000);
  const order = { ...makeOrder({ id: ORDER_ID, recipientName: "Buyer 1", orderNumber: 1 }), status: "draft" };
  await installApiMocks(page, createState([order]));
};

const pathname = (page) => new URL(page.url()).pathname;
const isGone = (locator) => settle(async () => (await locator.count()) === 0);

// Lands on /orders with a known entry behind it so "left the page" is observable.
const openOrders = async (page) => {
  await page.goto(`${BASE_URL}/products`);
  await page.getByRole("link", { name: "Orders" }).first().click();
  await page.waitForURL("**/orders");
};

const createDialog = (page) => page.getByRole("dialog");
const openCreate = async (page) => {
  await page.getByRole("button", { name: /create order|new order/i }).first().click();
  await createDialog(page).first().waitFor();
};

export const run = async () => {
  const results = new Results("back closes modal");

  await withPage(VIEWPORT, async (page) => {
    await setup(page);
    await openOrders(page);

    await openCreate(page);
    await page.goBack();
    results.check(
      "Back closes the create-order dialog and stays on the page",
      (await isGone(createDialog(page))) && pathname(page) === "/orders",
      `${pathname(page)}`,
    );

    await openCreate(page);
    await page.keyboard.press("Escape");
    await isGone(createDialog(page));
    await page.goBack();
    results.check(
      "closing with Escape leaves history clean: one Back leaves the page",
      await settle(async () => pathname(page) === "/products"),
      pathname(page),
    );
    await page.goForward();
    await page.waitForURL("**/orders");
    results.check(
      "Forward does not reopen a closed dialog",
      (await createDialog(page).count()) === 0,
    );
  });

  await withPage(VIEWPORT, async (page) => {
    await setup(page);
    await openOrders(page);

    await page.getByText("Buyer 1").first().click();
    const details = page.getByRole("heading", { name: /order details/i });
    await details.waitFor();
    await page.goBack();
    results.check(
      "Back closes the order details dialog and keeps the page",
      (await isGone(details)) && pathname(page) === "/orders",
      pathname(page),
    );

    // Details hands over to the edit dialog: the first closes while the second opens.
    await page.getByText("Buyer 1").first().click();
    await details.waitFor();
    await page.getByRole("button", { name: /edit order/i }).click();
    const editDialog = page.getByRole("heading", { name: /edit order/i });
    await editDialog.waitFor();
    await page.goBack();
    results.check(
      "Back closes the edit dialog opened from the details dialog, keeping the page",
      (await isGone(editDialog)) && pathname(page) === "/orders",
      pathname(page),
    );
    await page.goBack();
    results.check(
      "no marker entries are left over: the next Back leaves the page",
      await settle(async () => pathname(page) === "/products"),
      pathname(page),
    );
  });

  return results;
};
