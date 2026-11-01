// "Select all N": ticking the page's header checkbox offers to select every order that
// matches the filters, and the bulk action then carries all those ids, not just the page's.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const VIEWPORT = { viewport: { width: 1280, height: 900 } };
const ALL_IDS = ["o1", "o2", "o3", "o4", "o5"].map((id) => `${id}-0000-4000-8000-000000000000`);

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const setup = async (page) => {
  const seen = { idsRequests: [], batchDeletes: [] };
  const pageOrders = ALL_IDS.slice(0, 2).map((id, index) => ({
    ...makeOrder({ id, recipientName: `Buyer ${index + 1}`, orderNumber: index + 1 }),
    status: "draft",
  }));
  await installApiMocks(page, createState(pageOrders));
  await page.route("**/api/v1/orders?*", (route) =>
    route.request().method() === "GET"
      ? json(route, { data: pageOrders, total: ALL_IDS.length, offset: 0, limit: 2 })
      : route.fallback(),
  );
  await page.route("**/api/v1/orders/ids*", (route) => {
    seen.idsRequests.push(new URL(route.request().url()).searchParams.toString());
    return json(route, { ids: ALL_IDS, total: ALL_IDS.length });
  });
  await page.route("**/api/v1/orders/batch-delete", (route) => {
    seen.batchDeletes.push(route.request().postDataJSON());
    return json(route, { deleted: ALL_IDS.length });
  });
  return seen;
};

export const run = async () => {
  const results = new Results("orders select all");

  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    const seen = await setup(page);
    await page.goto(`${BASE_URL}/orders`);
    await page.getByRole("checkbox", { name: "Select all rows" }).check();

    const banner = page.getByRole("status").filter({ hasText: "on this page are selected" });
    await banner.waitFor();
    results.check(
      "a full page selected offers to select every matching order",
      (await banner.innerText()).includes("Select all 5 orders"),
      await banner.innerText(),
    );

    await banner.getByRole("button", { name: "Select all 5 orders" }).click();
    await page.getByText("All 5 orders are selected.").waitFor();
    results.check(
      "the whole selection is counted in the bulk bar",
      (await page.getByText("5 orders selected").count()) > 0,
    );

    await page.getByRole("button", { name: "Delete", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForResponse("**/api/v1/orders/batch-delete");
    results.check(
      "deleting sends every matching id, not just the two on screen",
      seen.batchDeletes.length === 1 &&
        JSON.stringify(seen.batchDeletes[0].orderIds) === JSON.stringify(ALL_IDS),
      JSON.stringify(seen.batchDeletes),
    );
  });

  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    const seen = await setup(page);
    await page.goto(`${BASE_URL}/orders?status=draft`);
    await page.getByRole("checkbox", { name: "Select all rows" }).check();
    await page.getByRole("button", { name: "Select all 5 orders" }).click();
    await page.getByText("All 5 orders are selected.").waitFor();
    results.check(
      "the ids are fetched with the same filters as the list",
      seen.idsRequests.some((query) => query.includes("status=draft")),
      JSON.stringify(seen.idsRequests),
    );

    await page.getByPlaceholder(/search orders/i).fill("Buyer");
    await page.getByText("All 5 orders are selected.").waitFor({ state: "detached" });
    results.check(
      "changing the search drops the selection instead of keeping stale ids",
      (await page.getByText("orders selected").count()) === 0,
    );
  });

  return results;
};
