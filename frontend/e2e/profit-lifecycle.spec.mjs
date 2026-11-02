// Historical profit with unknown purchase costs, and cancelling a confirmed order,
// against a mocked API. Unknown profit must read as "—"/"Cost unknown" (never a
// zero) with a tooltip that says so, a chart with nothing to plot must say why,
// partial profit must say what it leaves out, and the CSV must keep the difference.
// Cancelling a confirmed order must warn and refresh what it changed.

import { readFile } from "node:fs/promises";
import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results, settle, waitFor } from "./support/runner.mjs";

const VIEWPORT = { viewport: { width: 1280, height: 900 } };

const incomplete = (lines, turnoverCents) => ({
  unknown_cost_lines: lines,
  unknown_cost_turnover_cents: turnoverCents,
  profit_complete: lines === 0,
});

const UNKNOWN_TOTAL = {
  total_revenue_cents: null,
  total_orders: 1,
  currency: "USD",
  ...incomplete(2, 5200),
};
const PARTIAL_TOTAL = {
  total_revenue_cents: 80000,
  total_orders: 3,
  currency: "USD",
  ...incomplete(2, 5200),
};
const BY_PRODUCT = [
  {
    product_id: "product-known",
    product_name: "Beans",
    total_revenue_cents: 80000,
    total_quantity: 4,
    currency: "USD",
    ...incomplete(0, 0),
  },
  {
    product_id: "product-legacy",
    product_name: "Cups",
    total_revenue_cents: null,
    total_quantity: 2,
    currency: "USD",
    ...incomplete(2, 5200),
  },
];
const BY_RECIPIENT = [
  {
    recipient_id: "recipient-1",
    recipient_name: "Legacy Buyer",
    total_revenue_cents: null,
    total_orders: 1,
    currency: "USD",
    ...incomplete(2, 5200),
  },
];
const DAILY = [
  {
    date: "2026-10-27",
    revenue_cents: 0,
    turnover_cents: 0,
    ...incomplete(0, 0),
  },
  {
    date: "2026-10-28",
    revenue_cents: null,
    turnover_cents: 5200,
    ...incomplete(2, 5200),
  },
  {
    date: "2026-10-29",
    revenue_cents: 80000,
    turnover_cents: 100000,
    ...incomplete(0, 0),
  },
];

/** Dashboard endpoints on top of the shared mocks; `state.total` is read per request. */
const mockDashboard = async (page, state) => {
  await page.route("**/api/v1/orders/dashboard/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/orders/dashboard/",
      "",
    );
    state.requests.push(`GET dashboard/${path}`);
    const body = {
      "total-revenue": state.total,
      "revenue-by-products": state.byProduct ?? BY_PRODUCT,
      "revenue-by-recipients": BY_RECIPIENT,
      "daily-revenue": state.daily ?? DAILY,
      "status-summary": { draft: 1, confirmed: 1, cancelled: 0 },
      "total-turnover": {
        total_turnover_cents: 105200,
        total_orders: 3,
        currency: "USD",
      },
      "turnover-by-products": [],
      "turnover-by-recipients": [],
    }[path];
    return route.fulfill({
      status: body ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(body ?? {}),
    });
  });
};

const analytics = async (page, total, byProduct = BY_PRODUCT) => {
  page.setDefaultTimeout(8000);
  const state = { ...createState(), total, byProduct };
  await installApiMocks(page, state);
  await mockDashboard(page, state);
  await page.goto(`${BASE_URL}/analytics`);
  // Chart labels are SVG text; single-word product names keep them matchable.
  await page
    .getByText(byProduct[0].product_name, { exact: true })
    .first()
    .waitFor();
  return state;
};

/** The card of a dashboard chart, found by its heading. */
const chartCard = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=..");

/**
 * Moves the mouse onto a bar row or a day of a chart and reads its tooltip once
 * it shows `expected`: a previous hover's text may still be in place.
 */
const tooltipAt = async (page, card, position, expected) => {
  await card.locator(".recharts-wrapper").scrollIntoViewIfNeeded();
  const plot = await card.locator(".recharts-wrapper").boundingBox();
  const { x, y } = await position(plot);
  await page.mouse.move(x, y);
  const tooltip = card.locator(".recharts-tooltip-wrapper");
  await settle(async () => (await tooltip.innerText()).includes(expected));
  return tooltip.innerText();
};

const unknownTotalIsADash = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    await analytics(page, UNKNOWN_TOTAL);
    const kpi = page.getByText("Total Profit").locator("xpath=../..");
    await kpi.getByTestId("profit-unknown").waitFor();
    const text = await kpi.innerText();
    results.check(
      "unknown total profit shows a dash and 'Cost unknown', not a zero",
      text.includes("—") &&
        text.includes("Cost unknown") &&
        !/0[,.]00/.test(text),
      JSON.stringify(text),
    );
    const recipientRow = page
      .getByText("Legacy Buyer")
      .locator("xpath=../../..");
    const row = await recipientRow.innerText();
    results.check(
      "a recipient whose costs are all unknown shows '—' with the hint",
      row.includes("—") && row.includes("Cost unknown"),
      JSON.stringify(row),
    );
  });
};

const partialTotalHasABadge = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    await analytics(page, PARTIAL_TOTAL);
    const kpi = page.getByText("Total Profit").locator("xpath=../..");
    const badge = kpi.getByTestId("profit-partial");
    await badge.waitFor();
    const title = (await badge.getAttribute("title")) || "";
    const text = await kpi.innerText();
    results.check(
      "partial total profit keeps its amount and shows a 'Partial' badge",
      /800/.test(text) && (await badge.innerText()).startsWith("Partial"),
      JSON.stringify(text),
    );
    results.check(
      "the badge explains how many lines and how much turnover were left out",
      title.includes("2 order line") && /52[,.]00/.test(title),
      title,
    );
  });
};

const unknownBarHasATooltip = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    await analytics(page, PARTIAL_TOTAL);
    const card = chartCard(page, "Profit by Product");
    const label = await card.getByText("Cups", { exact: true }).boundingBox();
    const unknown = await tooltipAt(
      page,
      card,
      async (plot) => ({
        x: plot.x + plot.width / 2,
        y: label.y + label.height / 2,
      }),
      "Cups",
    );
    results.check(
      "hovering a bar with an unknown profit shows '—' and why, not nothing",
      unknown.includes("Cups") &&
        unknown.includes("—") &&
        unknown.includes("Cost unknown") &&
        unknown.includes("2 order line") &&
        !/0[,.]00/.test(unknown.replace(/52[,.]00/, "")),
      JSON.stringify(unknown),
    );
    const known = await card.getByText("Beans", { exact: true }).boundingBox();
    const amount = await tooltipAt(
      page,
      card,
      async (plot) => ({
        x: plot.x + plot.width / 2,
        y: known.y + known.height / 2,
      }),
      "Beans",
    );
    results.check(
      "hovering a known bar still shows its amount without a note",
      amount.includes("Beans") &&
        /800/.test(amount) &&
        !amount.includes("Cost unknown"),
      JSON.stringify(amount),
    );
  });
};

const allUnknownChartSaysSo = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    await analytics(page, UNKNOWN_TOTAL, [BY_PRODUCT[1]]);
    const card = chartCard(page, "Profit by Product");
    const message = card.getByTestId("chart-message");
    const shown = await message
      .waitFor()
      .then(() => true)
      .catch(() => false);
    results.check(
      "a chart whose every row is unknown says so instead of an empty plot",
      shown &&
        (await message.innerText()).includes("purchase cost is unknown") &&
        (await card.locator(".recharts-wrapper").count()) === 0,
      shown ? await card.innerText() : "no message rendered",
    );
    results.check(
      "the quantity chart still plots those products",
      (await chartCard(page, "Top Products by Quantity")
        .locator(".recharts-wrapper")
        .count()) === 1,
    );
  });
};

const presetEndsOnTheUtcDate = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    await analytics(page, PARTIAL_TOTAL);
    const [request] = await Promise.all([
      page.waitForRequest(/dashboard\/total-revenue\?.*endDate=/),
      page.getByRole("button", { name: "7d" }).click(),
    ]);
    const endDate = new URL(request.url()).searchParams.get("endDate");
    results.check(
      "a period preset ends on today's UTC date, which the API reads as the whole day",
      endDate === new Date().toISOString().split("T")[0],
      String(endDate),
    );
  });
};

const csvKeepsUnknownEmpty = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    await analytics(page, PARTIAL_TOTAL);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export csv/i }).click(),
    ]);
    const csv = (await readFile(await download.path(), "utf8")).replace(
      /^﻿/,
      "",
    );
    const [header, ...rows] = csv.split("\n");
    results.check(
      "CSV adds completeness columns",
      header ===
        "Product Name,Profit,Quantity,Currency,Profit complete,Lines with unknown cost,Turnover with unknown cost",
      header,
    );
    results.check(
      "CSV leaves an unknown profit empty and reports what is missing",
      rows.includes("Cups,,2,USD,false,2,52.00"),
      JSON.stringify(rows),
    );
    results.check(
      "CSV keeps a complete profit as a number",
      rows.includes("Beans,800.00,4,USD,true,0,0.00"),
      JSON.stringify(rows),
    );
  });
};

const homeShowsPartialAndGaps = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(8000);
    const state = { ...createState(), total: PARTIAL_TOTAL };
    await installApiMocks(page, state);
    await mockDashboard(page, state);
    await page.goto(`${BASE_URL}/dashboard`);
    const card = page.getByText("Profit Over Time").locator("xpath=../../..");
    await card.getByTestId("profit-partial").waitFor();
    results.check(
      "the revenue sparkline flags days with unknown cost",
      (await card.getByTestId("profit-partial").count()) === 1 &&
        (await card.getByTestId("profit-unknown").count()) === 0,
    );
    // The unknown day is a gap: the profit line is split into two segments.
    const profitPath = await card
      .locator(".recharts-area-curve")
      .last()
      .getAttribute("d");
    results.check(
      "the unknown day is drawn as a gap, not a zero",
      (profitPath?.match(/M/g) || []).length === 2,
      String(profitPath),
    );
    // The middle day has no profit point; the axis label marks where it is.
    const day = await card
      .locator(".recharts-xAxis-tick-labels text")
      .nth(1)
      .boundingBox();
    const tooltip = await tooltipAt(
      page,
      card,
      async (plot) => ({
        x: day.x + day.width / 2,
        y: plot.y + 60,
      }),
      "Turnover",
    );
    results.check(
      "hovering the unknown day shows '—' for its profit next to its turnover",
      /Profit\s*:\s*—/.test(tooltip) && /Turnover\s*:\s*[^—\s]/.test(tooltip),
      JSON.stringify(tooltip),
    );
  });
};

// Every day that has lines lacks a cost (the other day has no orders at all).
const DAILY_ALL_UNKNOWN = [DAILY[0], DAILY[1]];

const homeAllUnknownSaysCostUnknown = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(8000);
    const state = {
      ...createState(),
      total: UNKNOWN_TOTAL,
      daily: DAILY_ALL_UNKNOWN,
    };
    await installApiMocks(page, state);
    await mockDashboard(page, state);
    await page.goto(`${BASE_URL}/dashboard`);
    const card = page.getByText("Profit Over Time").locator("xpath=../../..");
    const unknown = card.getByTestId("profit-unknown");
    const shown = await unknown
      .waitFor()
      .then(() => true)
      .catch(() => false);
    results.check(
      "the sparkline reads \"Cost unknown\", not \"Partial\", when no charted line has a cost",
      shown &&
        (await unknown.innerText()).includes("Cost unknown") &&
        (await card.getByTestId("profit-partial").count()) === 0,
    );
  });
};

const cancelWarnsAndRefreshes = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(8000);
    const confirmed = {
      ...makeOrder({
        id: "order-confirmed",
        receiptId: "receipt-confirmed",
        receiptStatus: "generated",
        recipientName: "Confirmed Buyer",
      }),
      is_locked: true,
    };
    const draft = {
      ...makeOrder({ id: "order-draft", recipientName: "Draft Buyer" }),
      status: "draft",
    };
    const state = { ...createState([confirmed, draft]), total: PARTIAL_TOTAL };
    await installApiMocks(page, state);
    await mockDashboard(page, state);
    const cancels = [];
    await page.route("**/api/v1/orders/*/cancel", async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-2);
      cancels.push(id);
      const voided = {
        ...state.orders.find((order) => order.id === id),
        status: "cancelled",
      };
      voided.receipts = voided.receipts.map((receipt) => ({
        ...receipt,
        status: "void",
        void_reason: "order_cancelled",
      }));
      state.orders = state.orders.map((order) =>
        order.id === id ? voided : order,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(voided),
      });
    });

    // Start on the home dashboard so its receipt and profit queries are cached.
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByText("Profit Over Time").waitFor();
    await page.getByRole("link", { name: "Orders" }).first().click();
    const row = (name) => page.locator("tbody tr", { hasText: name });

    await row("Draft Buyer").getByRole("button", { name: /more/i }).click();
    await page.getByRole("menuitem", { name: /^cancel order$/i }).click();
    const draftDialog = await page.getByRole("dialog").innerText();
    results.check(
      "cancelling a draft asks without the confirmed-order warning",
      !draftDialog.includes("voids its receipt"),
      draftDialog,
    );
    // The draft only checks the wording; keep it so the confirmed order is the one cancel.
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^keep order$/i })
      .click();
    await page.getByRole("dialog").waitFor({ state: "detached" });

    await row("Confirmed Buyer").getByRole("button", { name: /more/i }).click();
    await page.getByRole("menuitem", { name: /^cancel order$/i }).click();
    const dialog = page.getByRole("dialog");
    const warning = await dialog.innerText();
    results.check(
      "cancelling a confirmed order warns: receipt voided, link revoked, stock not returned",
      warning.includes("voids its receipt") &&
        warning.includes("share link") &&
        warning.includes("Stock is not returned"),
      warning,
    );
    const before = state.requests.length;
    await dialog
      .getByRole("button", { name: /^cancel order$/i })
      .last()
      .click();
    await waitFor(() => cancels.length === 1, { label: "the cancel request" });
    await row("Confirmed Buyer")
      .getByText(/cancelled/i)
      .first()
      .waitFor();
    results.check(
      "the orders list is refetched and shows the voided document",
      state.requests.slice(before).includes("GET /orders") &&
        (await row("Confirmed Buyer").innerText()).match(/void/i) !== null,
      await row("Confirmed Buyer").innerText(),
    );

    const afterCancel = state.requests.length;
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await page.getByText("Profit Over Time").waitFor();
    await waitFor(
      () =>
        [
          "GET /receipts",
          "GET dashboard/total-revenue",
          "GET dashboard/daily-revenue",
          "GET dashboard/status-summary",
        ].every((request) =>
          state.requests.slice(afterCancel).includes(request),
        ),
      { label: "dashboard refetch" },
    ).catch(() => undefined);
    const refetched = state.requests.slice(afterCancel);
    results.check(
      "receipts and every dashboard figure are refetched after the cancel",
      [
        "GET /receipts",
        "GET dashboard/total-revenue",
        "GET dashboard/daily-revenue",
        "GET dashboard/status-summary",
      ].every((request) => refetched.includes(request)),
      JSON.stringify(refetched),
    );
  });
};

export const run = async () => {
  const results = new Results("profit and cancel");
  await unknownTotalIsADash(results);
  await partialTotalHasABadge(results);
  await unknownBarHasATooltip(results);
  await allUnknownChartSaysSo(results);
  await presetEndsOnTheUtcDate(results);
  await csvKeepsUnknownEmpty(results);
  await homeShowsPartialAndGaps(results);
  await homeAllUnknownSaysCostUnknown(results);
  await cancelWarnsAndRefreshes(results);
  return results;
};
