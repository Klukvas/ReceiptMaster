// The "similar products" hint on the create form against a mocked API that
// enforces the backend's pagination cap, so an oversized request fails as it
// does in production instead of quietly returning the fixture list.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { paginated } from "./support/fixtures.mjs";
import { Results, waitFor } from "./support/runner.mjs";

const MAX_LIMIT = 100;
const OLD_PRODUCT = {
  id: "product-old",
  name: "Arabica beans 1kg",
  purchase_price_cents: 1400,
  sale_price_cents: 2600,
  quantity: 7,
  currency: "UAH",
  supplier_id: null,
  created_at: "2020-01-02T00:00:00.000Z",
  updated_at: "2020-01-02T00:00:00.000Z",
};

const setup = async (page) => {
  page.setDefaultTimeout(5000);
  await installApiMocks(page, createState());
  const searches = [];
  await page.route("**/api/v1/products**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/v1/products") return route.fallback();
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const search = url.searchParams.get("search");
    searches.push({ limit, search });
    if (limit > MAX_LIMIT) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "limit", errorCode: "VALIDATION_ERROR" }),
      });
    }
    const matches = search && OLD_PRODUCT.name.toLowerCase().includes(search.toLowerCase());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paginated(matches ? [OLD_PRODUCT] : [])),
    });
  });
  await page.goto(`${BASE_URL}/products`);
  await page.getByRole("button", { name: "Create Product" }).first().click();
  await page.getByRole("heading", { name: "Create Product" }).waitFor();
  return searches;
};

export const run = async () => {
  const results = new Results("product similar hint");

  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    const searches = await setup(page);

    await page.getByLabel("Product Name").fill("arabica");
    const shown = await page
      .getByText("Arabica beans 1kg")
      .waitFor()
      .then(() => true)
      .catch(() => false);
    results.check(
      "typing a name finds a match the server returns for that search",
      shown,
      JSON.stringify(searches),
    );
    results.check(
      "the search stays within the API's limit cap",
      searches.every(({ limit }) => limit <= MAX_LIMIT),
      JSON.stringify(searches),
    );
    results.check(
      "the search sends the typed name",
      searches.some(({ search }) => search === "arabica"),
      JSON.stringify(searches),
    );

    await page.getByLabel("Product Name").fill("a");
    await waitFor(
      async () => (await page.getByText("Arabica beans 1kg").count()) === 0,
      { label: "hint hidden for a one-letter name" },
    );
    results.check("a one-letter name shows no hint", true);
  });

  return results;
};
