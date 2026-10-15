import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import {
  PRODUCTS,
  RECIPIENTS,
  makeOrder,
  paginated,
} from "./support/fixtures.mjs";
import { Results, waitFor } from "./support/runner.mjs";

const products = Array.from({ length: 125 }, (_, i) => ({
  ...PRODUCTS[0],
  id: `p-${i}`,
  name: `Catalogue ${i}`,
  currency: i === 124 ? "EUR" : "USD",
}));
const recipients = Array.from({ length: 125 }, (_, i) => ({
  ...RECIPIENTS[0],
  id: `r-${i}`,
  name: `Buyer ${i}`,
}));
const order = (id, name) => ({
  ...makeOrder({ id, recipientName: name }),
  status: "draft",
  recipient_id: "r-120",
  items: [
    {
      id: "line",
      product_id: "p-120",
      product_name: "Catalogue 120",
      qty: 2,
      unit_price_cents: 500,
      line_total_cents: 1000,
    },
  ],
});
const setup = async (page, initialOrders) => {
  page.setDefaultTimeout(5000);
  const state = createState(
    initialOrders || [order("A", "Alpha"), order("B", "Beta")],
  );
  const submissions = [];
  const queries = [];
  await installApiMocks(page, state);
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const send = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (/^\/(products|recipients)(\/|$)/.test(path)) {
      queries.push(url);
      const collection = path.startsWith("/products") ? products : recipients;
      const id = path.split("/")[2];
      if (id) return send(collection.find((item) => item.id === id));
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const filtered = collection.filter((item) =>
        item.name.toLowerCase().includes(search),
      );
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 10);
      return send({
        ...paginated(filtered.slice(offset, offset + limit)),
        total: filtered.length,
      });
    }
    if (path === "/orders" && request.method() === "GET") {
      state.orderQueries = [...(state.orderQueries || []), url];
      if (state.waitForOrders) await state.waitForOrders;
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const advanced = ["startDate", "endDate", "minAmount", "maxAmount"].some(
        (key) => url.searchParams.has(key),
      );
      const filtered = state.orders.filter(
        (item) =>
          item.recipient.name.toLowerCase().includes(search) &&
          (!advanced || item.id === "B"),
      );
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 10);
      return send({
        ...paginated(filtered.slice(offset, offset + limit)),
        total: filtered.length,
      });
    }
    if (path.startsWith("/orders") && request.method() !== "GET") {
      submissions.push({ path, data: request.postDataJSON() });
      if (request.method() === "PATCH")
        return send(
          {
            error: state.failure || "Insufficient stock",
            errorCode: state.errorCode || "BAD_REQUEST",
          },
          400,
        );
      return send({ approved: 1, deleted: 1 });
    }
    return route.fallback();
  });
  await page.goto(`${BASE_URL}/orders`);
  await page
    .getByText(state.orders[0].recipient.name, { exact: true })
    .first()
    .waitFor();
  return { state, submissions, queries };
};
const create = async (page) => {
  await page
    .getByRole("button", { name: /create order/i })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
};
const chooseRecipient = async (page) => {
  await page.locator("div[role=combobox]").click();
  await page.getByPlaceholder(/search recipient/i).fill("Buyer 120");
  await page
    .getByRole("option", { name: /Buyer 120/ })
    .click({ timeout: 4000 });
};
export const run = async () => {
  const results = new Results("order audit");
  const scenario = async (name, run) => {
    if (
      process.env.E2E_ORDER_CASE &&
      !new RegExp(process.env.E2E_ORDER_CASE).test(name)
    )
      return;
    try {
      await withPage({ viewport: { width: 1280, height: 900 } }, run);
      results.pass(name);
    } catch (error) {
      results.fail(name, error.message);
    }
  };
  await scenario("10: A/filter/B approval sends only B", async (page) => {
    const { submissions } = await setup(page);
    await page
      .locator("tbody tr")
      .filter({ hasText: "Alpha" })
      .getByRole("checkbox")
      .check();
    await page.getByPlaceholder(/search orders/i).fill("Beta");
    await waitFor(async () => (await page.locator("tbody tr").count()) === 1);
    await page.locator("tbody tr").getByRole("checkbox").check();
    await page.getByRole("button", { name: /^approve$/i }).click();
    await waitFor(() => submissions.length > 0);
    if (JSON.stringify(submissions[0].data.orderIds) !== '["B"]')
      throw Error(JSON.stringify(submissions[0]));
  });
  await scenario(
    "11/12/13: search record 121, USD totals, submit zero",
    async (page) => {
      const { submissions, queries } = await setup(page);
      await create(page);
      await chooseRecipient(page);
      await page.locator("input[role=combobox]").fill("Catalogue 120");
      await page
        .getByRole("option", { name: /Catalogue 120/ })
        .click({ timeout: 4000 });
      await page.getByRole("heading", { name: "Catalogue 120" }).waitFor();
      const dialog = page.getByRole("dialog");
      if ((await dialog.innerText()).includes("₴"))
        throw Error("USD line/summary rendered UAH");
      await page.getByRole("button", { name: /^custom$/i }).click();
      await dialog.locator("input[inputmode=decimal]").fill("0");
      await dialog.locator("button[type=submit]").click();
      await waitFor(() => submissions.length > 0);
      if (submissions[0].data.items[0].unitPriceCents !== 0)
        throw Error("zero override missing from POST");
      if (
        !queries.some(
          (url) => url.searchParams.get("search") === "Catalogue 120",
        )
      )
        throw Error("No server search");
    },
  );
  await scenario(
    "11/14: edit hydrates record 121 and exposes rejection without losing inputs",
    async (page) => {
      await setup(page);
      await page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: /more/i })
        .click();
      await page.getByRole("menuitem", { name: /edit/i }).last().click();
      await page.getByRole("heading", { name: /edit order/i }).waitFor();
      await waitFor(async () =>
        (await page.locator("form").innerText()).includes("Catalogue 120"),
      );
      if (!(await page.locator("form").innerText()).includes("Buyer 120"))
        throw Error("Recipient missing");
      await page.getByRole("button", { name: /^save$/i }).click();
      await page.getByRole("alert").waitFor({ timeout: 4000 });
      if ((await page.locator("input[type=number]").inputValue()) !== "2")
        throw Error("Inputs lost");
    },
  );

  for (const filter of [
    "search",
    "startDate",
    "endDate",
    "minAmount",
    "maxAmount",
  ]) {
    await scenario(
      `10: ${filter} clears A immediately and deletion sends only B`,
      async (page) => {
        const { state, submissions } = await setup(page);
        await page
          .locator("tbody tr")
          .filter({ hasText: "Alpha" })
          .getByRole("checkbox")
          .check();
        let release;
        state.waitForOrders = new Promise((resolve) => {
          release = resolve;
        });
        if (filter === "search")
          await page.getByPlaceholder(/search orders/i).fill("Beta");
        else {
          await page.getByRole("button", { name: /^filters$/i }).click();
          const index = ["startDate", "endDate"].includes(filter)
            ? filter === "startDate"
              ? 0
              : 1
            : filter === "minAmount"
              ? 0
              : 1;
          await page
            .locator(
              filter.includes("Date")
                ? "input[type=date]"
                : "input[type=number]",
            )
            .nth(index)
            .fill(filter.includes("Date") ? "2026-01-02" : "20");
        }
        if (await page.getByRole("button", { name: /^approve$/i }).count())
          throw Error("Bulk action visible during search/filter transition");
        if (
          await page
            .locator("tbody tr")
            .first()
            .getByRole("checkbox")
            .isChecked()
        )
          throw Error("Stale selection is checked during loading");
        release();
        state.waitForOrders = null;
        await waitFor(
          async () => (await page.locator("tbody tr").count()) === 1,
        );
        await page.locator("tbody tr").getByRole("checkbox").check();
        await page.getByRole("button", { name: /^delete$/i }).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: /^delete$/i })
          .click();
        await waitFor(() => submissions.length > 0);
        if (JSON.stringify(submissions[0].data.orderIds) !== '["B"]')
          throw Error(JSON.stringify(submissions[0]));
      },
    );
  }
  await scenario("10: sorting resets selection", async (page) => {
    await setup(page);
    await page.locator("tbody tr").first().getByRole("checkbox").check();
    await page
      .getByRole("columnheader", { name: /total/i })
      .locator("button")
      .click();
    await waitFor(
      async () =>
        !(await page
          .locator("tbody tr")
          .first()
          .getByRole("checkbox")
          .isChecked()),
    );
    if (await page.getByRole("button", { name: /^approve$/i }).count())
      throw Error("Selection survived sorting");
  });
  for (const currency of ["USD", "EUR"]) {
    for (const price of ["0", ""]) {
      await scenario(
        `12/13: ${currency} create totals and ${price === "" ? "empty default" : "zero"} submission`,
        async (page) => {
          const { submissions } = await setup(page);
          await create(page);
          await page.locator("div[role=combobox]").click();
          await page.getByRole("option", { name: /Buyer 0\b/ }).click();
          await page
            .locator("input[role=combobox]")
            .fill(currency === "EUR" ? "Catalogue 124" : "Catalogue 1");
          await page
            .getByRole("option", {
              name: new RegExp(`Catalogue ${currency === "EUR" ? 124 : 1}\\b`),
            })
            .first()
            .click();
          await page.getByRole("heading", { level: 4 }).waitFor();
          const dialog = page.getByRole("dialog");
          const text = await dialog.innerText();
          const expected = await page.evaluate(
            (currency) =>
              new Intl.NumberFormat("uk-UA", {
                style: "currency",
                currency,
              }).format(1299),
            currency,
          );
          const totals = await dialog
            .locator("span.tabular-nums")
            .allTextContents();
          if (
            totals.length !== 4 ||
            totals.some((total) => total.trim() !== expected)
          )
            throw Error(
              `Incorrect totals: ${JSON.stringify(totals)} expected ${expected}; ${text}`,
            );
          await page.getByRole("button", { name: /^custom$/i }).click();
          await dialog.locator("input[inputmode=decimal]").fill(price);
          await dialog.locator("button[type=submit]").click();
          await waitFor(() => submissions.length > 0);
          const override = submissions[0].data.items[0].unitPriceCents;
          if (override !== (price === "" ? undefined : 0))
            throw Error(`Wrong override: ${override}`);
        },
      );
    }
  }
  await scenario(
    "11: bounded pagination reaches products and recipients past record 100",
    async (page) => {
      const { queries } = await setup(page);
      await create(page);
      await page.locator("div[role=combobox]").click();
      for (let i = 0; i < 4; i += 1) {
        await page.getByRole("button", { name: /load more/i }).click();
        await waitFor(
          async () =>
            (await page.getByRole("listbox").getByRole("option").count()) ===
            (i + 2) * 25,
          { label: `page ${i + 2} options` },
        ).catch(async (error) => {
          throw Error(
            `${error.message}; options=${await page.getByRole("option").count()}; requests=${queries.map((url) => url.pathname + url.search).join(", ")}; popup=${await page.locator("[role=listbox]").count()}; body=${(await page.locator("body").innerText()).slice(-1500)}`,
          );
        });
      }
      await page.getByRole("option", { name: /Buyer 120\b/ }).click();
      await page.locator("input[role=combobox]").click();
      for (let i = 0; i < 4; i += 1) {
        await page.getByRole("button", { name: /load more/i }).click();
        await waitFor(
          async () =>
            (await page.getByRole("listbox").getByRole("option").count()) ===
            (i + 2) * 25,
          { label: `page ${i + 2} options` },
        ).catch(async (error) => {
          throw Error(
            `${error.message}; options=${await page.getByRole("option").count()}; requests=${queries.map((url) => url.pathname + url.search).join(", ")}; popup=${await page.locator("[role=listbox]").count()}; body=${(await page.locator("body").innerText()).slice(-1500)}`,
          );
        });
      }
      await page.getByRole("option", { name: /Catalogue 120/ }).click();
      await page.getByRole("heading", { name: "Catalogue 120" }).waitFor();
      if (queries.some((url) => Number(url.searchParams.get("limit")) > 25))
        throw Error("Unbounded catalogue request");
    },
  );
  await scenario(
    "12: mixed currencies never display an aggregate or submit",
    async (page) => {
      const { submissions } = await setup(page);
      await create(page);
      await chooseRecipient(page);
      await page.locator("input[role=combobox]").fill("Catalogue 120");
      await page.getByRole("option", { name: /Catalogue 120/ }).click();
      await page.getByRole("heading", { name: "Catalogue 120" }).waitFor();
      await page.getByRole("button", { name: /add product/i }).click();
      await page.locator("input[role=combobox]").fill("Catalogue 124");
      await page.getByRole("option", { name: /Catalogue 124/ }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: /same currency/i })
        .waitFor();
      if (
        !(await page
          .getByRole("dialog")
          .locator("button[type=submit]")
          .isDisabled())
      )
        throw Error("Mixed currency submission enabled");
      if (submissions.length) throw Error("Submitted mixed currencies");
    },
  );
  await scenario(
    "11/12/13/14: edit retains selections across search and zero/empty overrides across rejection",
    async (page) => {
      const { state, submissions } = await setup(page);
      await page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: /more/i })
        .click();
      await page.getByRole("menuitem", { name: /edit/i }).click();
      await waitFor(async () =>
        (await page.locator("form").innerText()).includes("Catalogue 120"),
      );
      await page.locator("div[role=combobox]").nth(1).click();
      await page.getByPlaceholder(/search product/i).fill("Catalogue 1");
      await page.getByRole("option", { name: /Catalogue 1 -/ }).click();
      await waitFor(async () =>
        (await page.locator("form").innerText()).includes("Catalogue 1 -"),
      );
      const price = page.locator("form input[inputmode=decimal]");
      await price.fill("0");
      await page.getByRole("button", { name: /^save$/i }).click();
      await page.getByRole("alert").waitFor();
      if (
        submissions[0].data.items[0].productId !== "p-1" ||
        submissions[0].data.items[0].unitPriceCents !== 0
      )
        throw Error(JSON.stringify(submissions[0]));
      if ((await price.inputValue()) !== "0")
        throw Error("Zero input lost after stock rejection");
      const zero = await page.evaluate(() =>
        new Intl.NumberFormat("uk-UA", {
          style: "currency",
          currency: "USD",
        }).format(0),
      );
      if (
        (await page
          .locator("form")
          .getByText(zero, { exact: true })
          .count()) !== 2
      )
        throw Error("Edit line and total must both be zero USD");
      state.errorCode = "ORDER_CANNOT_BE_MODIFIED";
      state.failure = "Order already confirmed";
      await price.fill("");
      await page.getByRole("button", { name: /^save$/i }).click();
      await waitFor(() => submissions.length === 2);
      await page.getByRole("alert").waitFor();
      if (submissions[1].data.items[0].unitPriceCents !== undefined)
        throw Error("Empty override sent a custom price");
      if (!(await page.getByRole("alert").innerText()).trim())
        throw Error("Concurrent confirmation rejection not visible");
      if (!(await page.locator("form").innerText()).includes("Buyer 120"))
        throw Error("Selected recipient was lost across search");
    },
  );

  await scenario(
    "12: USD line and summary totals use product currency",
    async (page) => {
      await setup(page);
      await create(page);
      await page.locator("div[role=combobox]").click();
      await page.getByRole("option", { name: /Buyer 0\b/ }).click();
      await page.locator("input[role=combobox]").fill("Catalogue 1");
      await page
        .getByRole("option", { name: /Catalogue 1\b/ })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "Catalogue 1", exact: true })
        .waitFor();
      const text = await page.getByRole("dialog").innerText();
      if (text.includes("₴")) throw Error("USD line/summary rendered UAH");
      const expected = await page.evaluate(() =>
        new Intl.NumberFormat("uk-UA", {
          style: "currency",
          currency: "USD",
        }).format(1299),
      );
      if (
        (await page
          .getByRole("dialog")
          .getByText(expected, { exact: true })
          .count()) !== 4
      )
        throw Error(
          "Product price, line total, subtotal and total must all be USD",
        );
    },
  );
  await scenario(
    "13: create zero override is included in POST after blur",
    async (page) => {
      const { submissions } = await setup(page);
      await create(page);
      await page.locator("div[role=combobox]").click();
      await page.getByRole("option", { name: /Buyer 0\b/ }).click();
      await page.locator("input[role=combobox]").fill("Catalogue 1");
      await page
        .getByRole("option", { name: /Catalogue 1\b/ })
        .first()
        .click();
      await page.getByRole("button", { name: /^custom$/i }).click();
      await page
        .getByRole("dialog")
        .locator("input[inputmode=decimal]")
        .fill("0");
      await page.getByRole("dialog").locator("button[type=submit]").click();
      await waitFor(() => submissions.length > 0);
      if (submissions[0].data.items[0].unitPriceCents !== 0)
        throw Error("Zero became undefined in POST");
    },
  );
  await scenario(
    "14: edit stock rejection is visible and retains inputs",
    async (page) => {
      const small = {
        ...order("A", "Alpha"),
        recipient_id: "r-0",
        items: [
          {
            id: "line",
            product_id: "p-1",
            product_name: "Catalogue 1",
            qty: 2,
            unit_price_cents: 500,
            line_total_cents: 1000,
          },
        ],
      };
      await setup(page, [small]);
      await page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: /more/i })
        .click();
      await page.getByRole("menuitem", { name: /edit/i }).click();
      await waitFor(async () =>
        (await page.locator("form").innerText()).includes("Catalogue 1"),
      );
      await page.getByRole("button", { name: /^save$/i }).click();
      await page.getByRole("alert").waitFor();
      if ((await page.locator("input[type=number]").inputValue()) !== "2")
        throw Error("Inputs lost");
    },
  );

  await scenario(
    "10: page and page-size changes clear selection",
    async (page) => {
      await setup(
        page,
        Array.from({ length: 12 }, (_, i) => order(`A${i}`, `Alpha ${i}`)),
      );
      await page.locator("tbody tr").first().getByRole("checkbox").check();
      await page.getByRole("button", { name: "2", exact: true }).click();
      await waitFor(async () => (await page.locator("tbody tr").count()) === 2);
      if (await page.getByRole("button", { name: /^approve$/i }).count())
        throw Error("Selection survived page change");
      await page.locator("tbody tr").first().getByRole("checkbox").check();
      await page
        .locator("select")
        .filter({ has: page.locator('option[value="20"]') })
        .selectOption("20");
      await waitFor(
        async () => (await page.locator("tbody tr").count()) === 12,
      );
      if (await page.getByRole("button", { name: /^approve$/i }).count())
        throw Error("Selection survived page-size change");
    },
  );
  await scenario(
    "12: EUR edit line and total use hydrated product currency",
    async (page) => {
      const euro = {
        ...order("A", "Alpha"),
        currency: "EUR",
        items: [
          {
            id: "line",
            product_id: "p-124",
            product_name: "Catalogue 124",
            qty: 2,
            unit_price_cents: 500,
            line_total_cents: 1000,
          },
        ],
      };
      await setup(page, [euro]);
      await page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: /more/i })
        .click();
      await page.getByRole("menuitem", { name: /edit/i }).click();
      await waitFor(async () =>
        (await page.locator("form").innerText()).includes("Catalogue 124"),
      );
      const expected = await page.evaluate(() =>
        new Intl.NumberFormat("uk-UA", {
          style: "currency",
          currency: "EUR",
        }).format(10),
      );
      if (
        (await page
          .locator("form")
          .getByText(expected, { exact: true })
          .count()) !== 2
      )
        throw Error("EUR edit line/total formatted incorrectly");
    },
  );
  return results;
};
