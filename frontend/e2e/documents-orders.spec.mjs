// Regression for orders that carry several documents (waybill, quote, invoice, act),
// at 1280px and 375px:
//  - download / print / share / customize keep acting on the waybill, never on
//    an invoice or act that happens to come first in `order.receipts`;
//  - a processing invoice shows its own chip and does not hide the waybill;
//  - retrying a failed invoice goes to POST .../documents, not the waybill route;
//  - the "Create document" menu group (quote, invoice, act, ...) follows the order status and the
//    documents it already has; creating sends one of dueDate / paymentTermDays;
//    a quote is offered for drafts too, suggests a validity date and sends it only when changed;
//    the suggestion counts "today" in the account's document time zone, not the browser's;
//  - editing a draft order that has an issued quote warns that the quote will not be updated (before and after
//    saving); a voided or failed quote raises no warning;
//  - a missing-requisites 422 becomes a banner with links, not a toast;
//  - the documents section of the details shows new documents without a reload;
//  - the retention confirmation names the document that would be replaced;
//  - a voided invoice or act can be issued again: the voided one moves to a "Voided (n)" history
//    under the new current document; voiding any other document closes its type; a voided waybill is not
//    offered for generation, and system void reasons are translated;
//  - a return note is offered for a confirmed order while any line has units left, however many notes
//    exist; its dialog lists the lines (ordered / already returned / quantity), validates on the client,
//    sends only ticked lines, maps RETURN_QUANTITY_EXCEEDED, ignores a double click, and every note is listed;
//  - replacing an invoice never offers (or starts from) a design that cannot carry it.

import {
  BASE_URL,
  createState,
  installApiMocks,
  startReceiptSocketServer,
  withPage,
} from "./support/harness.mjs";
import { Results, settle, waitFor } from "./support/runner.mjs";
import { PRODUCTS, makeOrder } from "./support/fixtures.mjs";
import { COMPLETE_COMPANY, documentHandlers } from "./support/document-mocks.mjs";
import { loadTsModule } from "./support/transpile.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib");

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 375, height: 812 };
const VIEWPORTS = [
  { label: "1280px", viewport: DESKTOP },
  { label: "375px", viewport: MOBILE },
];

const document = (id, type, status, createdAt) => ({
  id,
  order_id: "order-1",
  document_type: type,
  number: `${type.toUpperCase()}-1`,
  status,
  progress: status === "processing" ? 40 : 100,
  created_at: createdAt,
});

/** The invoice is listed first (and is newer): an index-based lookup would pick it. */
const orderWith = ({ waybillStatus, invoiceStatus }) => ({
  ...makeOrder({
    id: "order-1",
    receiptId: "wb-1",
    receiptStatus: waybillStatus,
    recipientName: "Aurora Coffee Bar",
  }),
  receipts: [
    document("inv-1", "invoice", invoiceStatus, "2026-02-01T10:05:00.000Z"),
    document("wb-1", "waybill", waybillStatus, "2026-02-01T10:00:00.000Z"),
  ],
});

/** The order's visible label: the table or the card list, whichever the viewport shows. */
const orderLabel = (page) =>
  page.getByText("Aurora Coffee Bar").locator("visible=true").first();

/** Opens the order details: a row click on the table, the "View" button on a phone's cards. */
const openDetails = async (page) => {
  const viewButton = page.getByRole("button", { name: "View", exact: true });
  if ((await viewButton.count()) > 0) await viewButton.first().click();
  else await orderLabel(page).click();
};

const gotoOrders = async (page) => {
  await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });
  await orderLabel(page).waitFor({ state: "visible" });
};

const openMenu = async (page) => {
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menu").waitFor({ state: "visible" });
};

const menuItems = async (page) =>
  (await page.getByRole("menuitem").allInnerTexts()).map((text) => text.trim());

const requested = (state, needle) => state.requests.some((line) => line.includes(needle));

const checkWaybillButtons = async (results) => {
  await withPage({ viewport: DESKTOP }, async (page) => {
    const state = createState([orderWith({ waybillStatus: "generated", invoiceStatus: "generated" })]);
    state.receipts = { "wb-1": document("wb-1", "waybill", "generated", "2026-02-01T10:00:00.000Z") };
    await installApiMocks(page, state);
    await gotoOrders(page);

    await openMenu(page);
    const items = await menuItems(page);
    results.check(
      "menu offers download, print and customize for an order with a waybill and an invoice",
      ["Download", "Print", "Customize document"].every((label) => items.includes(label)),
      `menu items: ${items.join(" | ")}`,
    );
    await page.getByRole("menuitem", { name: "Download", exact: true }).click();
    await settle(() => requested(state, "GET /receipts/wb-1/pdf"));
    results.check(
      "menu download fetches the waybill pdf, not the invoice",
      requested(state, "GET /receipts/wb-1/pdf") && !requested(state, "inv-1"),
      state.requests.join("\n"),
    );

    await openMenu(page);
    await page.getByRole("menuitem", { name: "Print", exact: true }).click();
    await settle(() => requested(state, "POST /receipts/wb-1/print"));
    results.check(
      "menu print targets the waybill",
      requested(state, "POST /receipts/wb-1/print") && !requested(state, "inv-1"),
      state.requests.join("\n"),
    );

    await orderLabel(page).click();
    await page
      .locator('[data-document-type="waybill"]')
      .getByRole("button", { name: "Share", exact: true })
      .click();
    await settle(() => requested(state, "/share"));
    results.check(
      "order details share the waybill",
      requested(state, "POST /receipts/wb-1/share") && !requested(state, "inv-1"),
      state.requests.join("\n"),
    );
  });
};

const checkProcessingInvoice = async (results) => {
  await withPage({ viewport: DESKTOP }, async (page) => {
    const state = createState([orderWith({ waybillStatus: "generated", invoiceStatus: "processing" })]);
    await installApiMocks(page, state);
    await gotoOrders(page);
    const chips = page.locator("span.receipt-processing:visible");
    await waitFor(async () => (await chips.count()) >= 1, { label: "the invoice chip" });
    results.check(
      "a processing invoice shows exactly one processing chip",
      (await chips.count()) === 1,
      `chips: ${await chips.count()}`,
    );

    await openMenu(page);
    const items = await menuItems(page);
    results.check(
      "a processing invoice does not take the waybill's download/customize entries away",
      items.includes("Download") && items.includes("Customize document"),
      `menu items: ${items.join(" | ")}`,
    );
  });

  await withPage({ viewport: DESKTOP }, async (page) => {
    const state = createState([orderWith({ waybillStatus: "processing", invoiceStatus: "generated" })]);
    await installApiMocks(page, state);
    await gotoOrders(page);
    await openMenu(page);
    const items = await menuItems(page);
    results.check(
      "a generated invoice does not offer download while the waybill is still generating",
      !items.includes("Download") && !items.includes("Customize document"),
      `menu items: ${items.join(" | ")}`,
    );
  });
};

const checkRetryRouting = async (results, socket) => {
  for (const { type, expectDocuments } of [
    { type: "invoice", expectDocuments: true },
    { type: "quote", expectDocuments: true },
    { type: "waybill", expectDocuments: false },
  ]) {
    await withPage({ viewport: DESKTOP }, async (page) => {
      const state = createState([
        { ...makeOrder({ id: "order-1", receiptId: "x", receiptStatus: "", recipientName: "Aurora Coffee Bar" }) },
      ]);
      state.receipts = { "failed-1": document("failed-1", type, "failed", "2026-02-01T10:00:00.000Z") };
      const bodies = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().endsWith("/documents")) {
          bodies.push(request.postData() ?? "");
        }
      });
      await installApiMocks(page, state);
      await gotoOrders(page);
      await socket.waitForClient();

      socket.emit("receipt.failed", { receiptId: "failed-1", orderId: "order-1", error: "boom" });
      await page.getByRole("button", { name: "Retry" }).click();
      await settle(() => state.generateRequests.length > 0);

      const [path] = state.generateRequests;
      results.check(
        `retrying a failed ${type} posts to ${expectDocuments ? "/documents" : "the waybill route"}`,
        expectDocuments
          ? path === "/receipts/orders/order-1/documents"
          : path === "/receipts/orders/order-1/receipt",
        `generate requests: ${JSON.stringify(state.generateRequests)}`,
      );
      if (expectDocuments) {
        results.check(
          `the ${type} retry sends its own type with empty details`,
          bodies.some((body) => body.includes(`"type":"${type}"`) && body.includes('"details":{}')),
          JSON.stringify(bodies),
        );
      }
    });
  }
};


const checkFailedDocumentRetry = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withPage({ viewport }, async (page) => {
      const state = createState([orderWith({ waybillStatus: "generated", invoiceStatus: "failed" })]);
      await installApiMocks(page, state);
      await gotoOrders(page);
      await openDetails(page);
      const card = page.locator('[data-testid="document-card"][data-document-type="invoice"]');
      await card.getByRole("button", { name: "Retry" }).click();
      await settle(() => state.generateRequests.length > 0);
      results.check(
        `${label}: a failed invoice card has its own Retry that posts to /documents`,
        state.generateRequests[0] === "/receipts/orders/order-1/documents",
        JSON.stringify(state.generateRequests),
      );
    });
  }
};

const checkRetryWithoutKnownType = async (results, socket) => {
  await withPage({ viewport: DESKTOP }, async (page) => {
    const state = createState([
      { ...makeOrder({ id: "order-1", receiptId: "x", receiptStatus: "", recipientName: "Aurora Coffee Bar" }) },
    ]);
    // A lookup answer without a type must not be turned into a waybill.
    const { document_type: _omitted, ...untyped } = document("failed-1", "invoice", "failed", "2026-02-01T10:00:00.000Z");
    state.receipts = { "failed-1": untyped };
    await installApiMocks(page, state);
    await gotoOrders(page);
    await socket.waitForClient();

    socket.emit("receipt.failed", { receiptId: "failed-1", orderId: "order-1", error: "boom" });
    await page.getByRole("button", { name: "Retry" }).click();
    await settle(() => state.generateRequests.length > 0);
    results.check(
      "retrying a document of unknown type sends nothing",
      state.generateRequests.length === 0,
      JSON.stringify(state.generateRequests),
    );
  });
};

const checkBadgeWraps = async (results) => {
  await withPage({ viewport: { width: 375, height: 812 } }, async (page) => {
    const state = createState([orderWith({ waybillStatus: "processing", invoiceStatus: "processing" })]);
    await installApiMocks(page, state);
    await gotoOrders(page);
    await openDetails(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    results.check("375px: status chips of several documents do not widen the page", overflow <= 0, `overflow: ${overflow}px`);
  });
};

const plainOrder = (overrides = {}) => ({
  ...makeOrder({ id: "order-1", receiptId: "", receiptStatus: "", recipientName: "Aurora Coffee Bar" }),
  ...overrides,
});

/** A page with the document mocks installed over a one-order list. */
const withDocumentPage = async (viewport, { order = plainOrder(), clockAt, ...stateOverrides }, run) =>
  withPage({ viewport }, async (page) => {
    const state = createState([order]);
    Object.assign(state, stateOverrides);
    state.handlers = documentHandlers(state);
    if (clockAt) await page.clock.setFixedTime(new Date(clockAt));
    await installApiMocks(page, state);
    await gotoOrders(page);
    return run(page, state);
  });

const menuOf = async (page) => {
  await openMenu(page);
  return menuItems(page);
};

const checkCreateGroup = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, { order: plainOrder({ status: "draft" }) }, async (page) => {
      const items = await menuOf(page);
      results.check(
        `${label}: a draft order offers only the quote under "Create document"`,
        !items.some((item) => /^(Invoice|Act of Completed Work|Sales receipt|Packing list|Return note)…/.test(item)) &&
          (await page.getByRole("group", { name: "Create document" }).getByRole("menuitem").allInnerTexts())
            .map((text) => text.trim())
            .join("|") === "Quote…" &&
          !items.includes("Generate waybill"),
        `menu items: ${items.join(" | ")}`,
      );
    });

    await withDocumentPage(viewport, {}, async (page) => {
      const items = await menuOf(page);
      const group = page.getByRole("group", { name: "Create document" });
      results.check(
        `${label}: a confirmed order lists quote, invoice, act, sales receipt, packing list and return note under "Create document", beside the one-click waybill`,
        items.includes("Generate waybill") &&
          (await group.getByRole("menuitem").allInnerTexts()).map((text) => text.trim()).join("|") ===
            "Quote…|Invoice…|Act of Completed Work…|Sales receipt…|Packing list…|Return note…",
        `menu items: ${items.join(" | ")}`,
      );
      await page.keyboard.press("ArrowDown");
      const focusedBefore = await page.locator('[role="menuitem"].bg-surface-alt').innerText();
      await page.keyboard.press("ArrowDown");
      const focusedAfter = await page.locator('[role="menuitem"].bg-surface-alt').innerText();
      results.check(
        `${label}: arrow keys still walk the flat menu`,
        focusedBefore.trim() !== focusedAfter.trim(),
        `${focusedBefore} -> ${focusedAfter}`,
      );
    });

    const withInvoice = plainOrder({
      receipts: [document("inv-1", "invoice", "generated", "2026-02-01T10:05:00.000Z")],
    });
    await withDocumentPage(viewport, { order: withInvoice }, async (page) => {
      const items = await menuOf(page);
      results.check(
        `${label}: a type that already has a document is not offered again`,
        items.includes("Act of Completed Work…") && !items.includes("Invoice…"),
        `menu items: ${items.join(" | ")}`,
      );
    });
  }
};

const openCreateDialog = async (page, name) => {
  await openMenu(page);
  await page.getByRole("menuitem", { name }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  return dialog;
};

const hasNoHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const checkInvoiceCreation = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, {}, async (page, state) => {
      const dialog = await openCreateDialog(page, "Invoice…");
      const days = dialog.getByLabel("Days to pay");
      results.check(
        `${label}: the invoice term defaults to the account's payment term`,
        (await days.inputValue()) === String(COMPLETE_COMPANY.defaultPaymentTermDays),
        await days.inputValue(),
      );
      const designs = await dialog.getByLabel("Document design").locator("option").allInnerTexts();
      results.check(
        `${label}: only designs that can carry an invoice are offered (no thermal, no locked)`,
        designs.join("|") === "Standard|Classic",
        designs.join("|"),
      );
      results.check(`${label}: the dialog fits the viewport`, await hasNoHorizontalOverflow(page), "horizontal overflow");

      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await settle(() => (state.created ?? []).length === 1);
      const [sent] = state.created ?? [];
      results.check(
        `${label}: the invoice request carries only paymentTermDays and the chosen design`,
        sent?.type === "invoice" &&
          JSON.stringify(sent.details) === '{"paymentTermDays":14}' &&
          sent.overrides?.templateId === "standard",
        JSON.stringify(sent),
      );
      results.check(
        `${label}: retention for the invoice type was checked first`,
        requested(state, "GET /receipts/retention"),
        state.requests.join("\n"),
      );
    });
  }

  await withDocumentPage(DESKTOP, {}, async (page, state) => {
    const dialog = await openCreateDialog(page, "Invoice…");
    await dialog.getByLabel("Due date").check();
    const dueDate = daysFromToday(30);
    await dialog.getByLabel("Pay by").fill(dueDate);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await settle(() => (state.created ?? []).length === 1);
    results.check(
      "choosing a due date sends dueDate and no paymentTermDays",
      JSON.stringify(state.created?.[0]?.details) === JSON.stringify({ dueDate }),
      JSON.stringify(state.created),
    );
  });
};

const checkActCreation = async (results) => {
  await withDocumentPage(DESKTOP, {}, async (page, state) => {
    const dialog = await openCreateDialog(page, "Act of Completed Work…");
    await dialog.getByLabel("Contract", { exact: true }).fill("Contract 7");
    await dialog.getByLabel("Period start").fill("2026-03-31");
    await dialog.getByLabel("Period end").fill("2026-03-01");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    results.check(
      "an act period that ends before it starts is refused on the client",
      (await dialog.getByText("The period start cannot be after its end").count()) === 1 &&
        (state.created ?? []).length === 0,
      JSON.stringify(state.created),
    );
    await dialog.getByLabel("Period start").fill("2026-03-01");
    await dialog.getByLabel("Period end").fill("2026-03-31");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await settle(() => (state.created ?? []).length === 1);
    results.check(
      "the act request carries the contract and the period",
      JSON.stringify(state.created?.[0]?.details) ===
        '{"contractRef":"Contract 7","period":{"from":"2026-03-01","to":"2026-03-31"}}',
      JSON.stringify(state.created),
    );
  });
};

const checkDetaillessCreation = async (results) => {
  const cases = [
    { menu: "Sales receipt…", type: "sales_receipt", note: /not a fiscal document/i },
    { menu: "Packing list…", type: "packing_list", note: /order is locked/i },
  ];
  for (const { menu, type, note } of cases) {
    for (const { label, viewport } of VIEWPORTS) {
      await withDocumentPage(viewport, {}, async (page, state) => {
        const dialog = await openCreateDialog(page, menu);
        results.check(
          `${label}: the ${type} dialog has no detail fields, only the design picker and a note`,
          (await dialog.getByLabel("Days to pay").count()) === 0 &&
            (await dialog.getByLabel("Contract", { exact: true }).count()) === 0 &&
            (await dialog.getByLabel("Document design").count()) === 1 &&
            note.test(await dialog.getByTestId("document-create-note").innerText()),
          await dialog.innerText(),
        );
        results.check(`${label}: the ${type} dialog fits the viewport`, await hasNoHorizontalOverflow(page), "horizontal overflow");
        await dialog.getByRole("button", { name: "Create", exact: true }).click();
        await settle(() => (state.created ?? []).length === 1);
        const [sent] = state.created ?? [];
        results.check(
          `${label}: the ${type} request has the design and no details`,
          sent?.type === type && !("details" in sent) && sent.overrides?.templateId === "standard",
          JSON.stringify(sent),
        );
      });
    }
  }
};

// The mocked account's document time zone is UTC, so "today" is the UTC day whatever zone this machine is in.
const daysFromToday = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const submitCreate = (dialog) => dialog.getByRole("button", { name: "Create", exact: true }).click();

const checkQuoteDialog = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, { order: plainOrder({ status: "draft" }) }, async (page, state) => {
      const dialog = await openCreateDialog(page, "Quote…");
      const until = dialog.getByLabel("Valid until");
      results.check(
        `${label}: the quote suggests today + 14 days and explains the default`,
        (await until.inputValue()) === daysFromToday(14) &&
          (await dialog.getByText("Defaults to 14 days from the issue date.").count()) === 1,
        await until.inputValue(),
      );
      results.check(
        `${label}: the quote dialog has the note, no invoice fields, and fits the viewport`,
        /does not lock the order/i.test(await dialog.getByTestId("document-create-note").innerText()) &&
          (await dialog.getByLabel("Days to pay").count()) === 0 &&
          (await hasNoHorizontalOverflow(page)),
        await dialog.innerText(),
      );
      await submitCreate(dialog);
      await settle(() => (state.created ?? []).length === 1);
      const [sent] = state.created ?? [];
      results.check(
        `${label}: an untouched date is not sent (the server counts it in the account's time zone)`,
        sent?.type === "quote" && JSON.stringify(sent.details) === "{}" && sent.overrides?.templateId === "standard",
        JSON.stringify(sent),
      );
      results.check(
        `${label}: retention was looked up for the quote type`,
        (state.retentionQueries ?? []).some((search) => search.includes("type=quote")),
        JSON.stringify(state.retentionQueries),
      );
    });
  }

  await withDocumentPage(DESKTOP, {}, async (page, state) => {
    const dialog = await openCreateDialog(page, "Quote…");
    await dialog.getByLabel("Valid until").fill(daysFromToday(30));
    await dialog.getByLabel("Payment terms").fill("  50% upfront  ");
    await dialog.getByLabel("Delivery terms").fill("   ");
    await submitCreate(dialog);
    await settle(() => (state.created ?? []).length === 1);
    results.check(
      "a changed date is sent; terms are trimmed and blank ones are left out",
      JSON.stringify(state.created?.[0]?.details) ===
        JSON.stringify({ validUntil: daysFromToday(30), paymentTerms: "50% upfront" }),
      JSON.stringify(state.created),
    );
  });

  await withDocumentPage(DESKTOP, {}, async (page, state) => {
    const dialog = await openCreateDialog(page, "Quote…");
    await dialog.getByLabel("Valid until").fill(daysFromToday(-1));
    await submitCreate(dialog);
    results.check(
      "a date in the past is refused on the client, under the date field, without a request",
      (await dialog.getByText("The date cannot be before today").count()) === 1 &&
        (state.created ?? []).length === 0 &&
        !requested(state, "GET /receipts/retention"),
      JSON.stringify(state.created),
    );
    await dialog.getByLabel("Valid until").fill(daysFromToday(400));
    await submitCreate(dialog);
    results.check(
      "a date more than 365 days away is refused on the client",
      (await dialog.getByText("At most 365 days from today").count()) === 1 && (state.created ?? []).length === 0,
      await dialog.innerText(),
    );
  });

  const serverRefusal = {
    status: 400,
    body: { error: "Validation error for details.validUntil: must not be before the issue date", errorCode: "VALIDATION_ERROR" },
  };
  await withDocumentPage(DESKTOP, { createError: serverRefusal }, async (page, state) => {
    const dialog = await openCreateDialog(page, "Quote…");
    await submitCreate(dialog);
    await settle(() => (state.createAttempts ?? []).length === 1);
    const field = dialog.locator("#document-valid-until");
    await settle(async () => (await field.getAttribute("aria-invalid")) === "true");
    results.check(
      "a server 400 on details.validUntil is shown under the date field",
      (await field.getAttribute("aria-invalid")) === "true" &&
        (await dialog.getByText("Check this field").count()) === 1 &&
        (await page.getByRole("dialog").count()) === 1,
      await dialog.innerText(),
    );
  });

  const sellerOnly = { error: "Required requisites are missing", errorCode: "DOCUMENT_REQUISITES_MISSING", fields: ["seller.name"], warnings: [] };
  await withDocumentPage(DESKTOP, { refusal: sellerOnly }, async (page) => {
    const dialog = await openCreateDialog(page, "Quote…");
    await submitCreate(dialog);
    const banner = dialog.getByTestId("requisites-missing");
    await banner.waitFor({ state: "visible" });
    const text = await banner.innerText();
    results.check(
      "a quote refused for requisites names only the seller name",
      text.includes("Seller name") && !text.includes("IBAN") && !text.includes("tax ID"),
      text,
    );
  });
};

const checkQuoteClock = async (results) => {
  const { documentToday, DEFAULT_DOCUMENT_TIME_ZONE } = loadTsModule(resolve(LIB, "document-clock.ts"));
  const details = loadTsModule(resolve(LIB, "document-details.ts"), {
    "./document-clock": { documentToday },
    "./document-types": { DOCUMENT_TYPE_META: {} },
  });
  // Same formula as the backend's issueDateIn (frozen-document.ts), the date a document is issued on.
  const serverDay = (now, timeZone) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

  const nearMidnight = new Date("2026-11-06T22:30:00Z");
  results.check(
    "documentToday follows the zone around midnight: Kyiv is already on the next day, UTC and Los Angeles are not",
    documentToday("Europe/Kyiv", nearMidnight) === "2026-11-07" &&
      documentToday("UTC", nearMidnight) === "2026-11-06" &&
      documentToday("America/Los_Angeles", nearMidnight) === "2026-11-06",
    [documentToday("Europe/Kyiv", nearMidnight), documentToday("UTC", nearMidnight)].join(" "),
  );
  results.check(
    "documentToday handles the Kyiv DST switch (UTC+2 to UTC+3 on 2026-03-29)",
    documentToday("Europe/Kyiv", new Date("2026-03-28T21:30:00Z")) === "2026-03-28" &&
      documentToday("Europe/Kyiv", new Date("2026-03-28T22:00:00Z")) === "2026-03-29" &&
      documentToday("Europe/Kyiv", new Date("2026-10-24T20:59:00Z")) === "2026-10-24" &&
      documentToday("Europe/Kyiv", new Date("2026-10-24T21:00:00Z")) === "2026-10-25",
    "DST boundary mismatch",
  );
  const zones = ["UTC", "Europe/Kyiv", "Pacific/Auckland", "America/New_York", "Asia/Kolkata"];
  const instants = ["2026-01-01T00:00:00Z", "2026-06-30T23:59:59Z", "2026-11-06T12:00:00Z", "2026-12-31T23:30:00Z"];
  results.check(
    "documentToday equals the day the backend takes as the issue date, for several zones and instants",
    zones.every((zone) => instants.every((at) => documentToday(zone, new Date(at)) === serverDay(new Date(at), zone))),
    "differs from issueDateIn",
  );
  results.check(
    "an unknown or missing zone falls back to Europe/Kyiv",
    DEFAULT_DOCUMENT_TIME_ZONE === "Europe/Kyiv" &&
      documentToday(undefined, nearMidnight) === "2026-11-07" &&
      documentToday("", nearMidnight) === "2026-11-07" &&
      documentToday("Not/AZone", nearMidnight) === "2026-11-07",
    "fallback mismatch",
  );
  const defaults = details.quoteDefaults("Europe/Kyiv", nearMidnight);
  results.check(
    "quoteDefaults suggests today + 14 days in the document zone, across a month end",
    defaults.today === "2026-11-07" &&
      defaults.validUntil === "2026-11-21" &&
      details.quoteDefaults("UTC", new Date("2026-12-25T23:30:00Z")).validUntil === "2027-01-08",
    JSON.stringify(defaults),
  );

  // In the browser: 23:30 UTC on 6 Nov is already the 7th in Auckland and still the 6th in Los Angeles.
  const instant = "2026-11-06T23:30:00Z";
  for (const { timeZone, today, until } of [
    { timeZone: "Pacific/Auckland", today: "2026-11-07", until: "2026-11-21" },
    { timeZone: "America/Los_Angeles", today: "2026-11-06", until: "2026-11-20" },
    { timeZone: "Not/AZone", today: "2026-11-07", until: "2026-11-21" },
  ]) {
    await withDocumentPage(DESKTOP, { order: plainOrder({ status: "draft" }), timeZone, clockAt: instant }, async (page, state) => {
      const dialog = await openCreateDialog(page, "Quote…");
      const field = dialog.getByLabel("Valid until");
      await settle(async () => (await field.inputValue()) === until);
      results.check(
        `${timeZone}: the dialog suggests ${until} and the earliest date is ${today}`,
        (await field.inputValue()) === until && (await field.getAttribute("min")) === today,
        `${await field.inputValue()} min=${await field.getAttribute("min")}`,
      );
      await submitCreate(dialog);
      await settle(() => (state.created ?? []).length === 1);
      results.check(
        `${timeZone}: the untouched suggestion is still not sent`,
        JSON.stringify(state.created?.[0]?.details) === "{}",
        JSON.stringify(state.created),
      );
    });
  }

  await withDocumentPage(DESKTOP, { order: plainOrder({ status: "draft" }), timeZone: "Pacific/Auckland", clockAt: instant }, async (page, state) => {
    const dialog = await openCreateDialog(page, "Quote…");
    await dialog.getByLabel("Valid until").fill("2026-11-06");
    await submitCreate(dialog);
    results.check(
      "Auckland: 6 Nov is yesterday there, so it is refused on the client",
      (await dialog.getByText("The date cannot be before today").count()) === 1 && (state.created ?? []).length === 0,
      await dialog.innerText(),
    );
    await dialog.getByLabel("Valid until").fill("2026-11-07");
    await submitCreate(dialog);
    await settle(() => (state.created ?? []).length === 1);
    results.check(
      "Auckland: 7 Nov is today there and is accepted and sent",
      JSON.stringify(state.created?.[0]?.details) === '{"validUntil":"2026-11-07"}',
      JSON.stringify(state.created),
    );
  });
};

const STALE_WARNING = "The issued quote QUOTE-1 will not be updated by this change. Void it and create a new one.";

const checkStaleQuoteWarning = async (results) => {
  for (const { label, status, expectWarning } of [
    { label: "an issued quote", status: "generated", expectWarning: true },
    { label: "a quote still generating", status: "processing", expectWarning: true },
    { label: "a voided quote", status: "void", expectWarning: false },
    { label: "a failed quote", status: "failed", expectWarning: false },
  ]) {
    await withPage({ viewport: DESKTOP }, async (page) => {
      const order = plainOrder({
        status: "draft",
        receipts: [document("q-1", "quote", status, "2026-02-01T10:05:00.000Z")],
      });
      const state = createState([order]);
      state.handlers = [
        ...documentHandlers(state),
        async (route, { path, method }, json) => {
          const product = PRODUCTS.find((entry) => path === `/products/${entry.id}`);
          if (!product || method !== "GET") return false;
          await json(route, product);
          return true;
        },
        async (route, { path, method, body }, json) => {
          if (path !== "/orders/order-1" || method !== "PATCH") return false;
          state.orderPatches = [...(state.orderPatches ?? []), JSON.parse(body)];
          await json(route, order);
          return true;
        },
      ];
      await installApiMocks(page, state);
      await gotoOrders(page);
      await openMenu(page);
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
      const form = page.getByRole("heading", { name: "Edit Order" });
      await form.waitFor({ state: "visible" });
      const warning = page.getByTestId("stale-quote-warning");
      results.check(
        expectWarning
          ? `${label}: the edit form warns before saving that the quote will not be updated`
          : `${label}: no stale-quote warning in the edit form`,
        expectWarning
          ? (await warning.count()) === 1 && (await warning.innerText()) === STALE_WARNING
          : (await warning.count()) === 0,
        (await warning.count()) > 0 ? await warning.innerText() : "no warning",
      );
      if (!expectWarning) return;

      const save = page.getByRole("button", { name: "Save", exact: true });
      await settle(async () => save.isEnabled());
      await save.click();
      await settle(() => (state.orderPatches ?? []).length === 1);
      const toastText = "Order saved. Quote QUOTE-1 was not updated: void it and create a new one.";
      await page.getByText(toastText).waitFor({ state: "visible", timeout: 5000 });
      results.check(
        `${label}: saving still works (nothing is voided) and a notice repeats the warning`,
        (state.orderPatches ?? []).length === 1 && (state.voided ?? []).length === 0,
        JSON.stringify({ patches: state.orderPatches, voided: state.voided }),
      );
    });
  }

  await withPage({ viewport: { width: 375, height: 812 } }, async (page) => {
    const order = plainOrder({
      status: "draft",
      receipts: [document("q-1", "quote", "generated", "2026-02-01T10:05:00.000Z")],
    });
    const state = createState([order]);
    state.handlers = documentHandlers(state);
    await installApiMocks(page, state);
    await gotoOrders(page);
    await openDetails(page);
    await page.getByRole("button", { name: "Edit Order" }).click();
    const warning = page.getByTestId("stale-quote-warning");
    await warning.waitFor({ state: "visible" });
    const box = await warning.boundingBox();
    results.check(
      "375px: the warning is fully visible inside the screen",
      box !== null && box.x >= 0 && box.x + box.width <= 375 && (await hasNoHorizontalOverflow(page)),
      JSON.stringify(box),
    );
  });
};

const checkQuoteVoidReissue = async (results) => {
  const withQuote = plainOrder({
    status: "draft",
    receipts: [document("q-1", "quote", "generated", "2026-02-01T10:05:00.000Z")],
  });
  await withDocumentPage(DESKTOP, { order: withQuote }, async (page, state) => {
    await openDetails(page);
    results.check(
      "a draft order shows its quote in the documents section",
      (await page.locator('[data-testid="document-card"][data-document-type="quote"]').count()) === 1,
      "no quote card",
    );
    await page.locator('[data-document-type="quote"]').getByRole("button", { name: "Void" }).click();
    const confirm = page.getByRole("dialog", { name: "Void: Quote" });
    await confirm.waitFor({ state: "visible" });
    await confirm.getByRole("button", { name: "Void", exact: true }).click();
    await settle(() => (state.voided ?? []).length === 1);
    const create = page.getByRole("button", { name: "Create: Quote" });
    await create.waitFor({ state: "visible", timeout: 5000 });
    await create.click();
    const dialog = page.getByRole("dialog");
    results.check(
      "after voiding a quote it can be created again, and the dialog names the voided number",
      (await dialog.getByTestId("document-reissue-note").innerText()).includes("QUOTE-1"),
      await dialog.innerText(),
    );
  });
};

const checkRequisitesBanner = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, { refusal: true }, async (page, state) => {
      const dialog = await openCreateDialog(page, "Invoice…");
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      const banner = dialog.getByTestId("requisites-missing");
      await banner.waitFor({ state: "visible" });
      const text = await banner.innerText();
      const sellerLink = await banner.getByRole("link").first().getAttribute("href");
      results.check(
        `${label}: a 422 shows the missing fields in a banner, with a link to the company settings`,
        text.includes("Seller IBAN") &&
          sellerLink === "/settings?tab=company&highlight=seller.iban",
        `${text} | ${sellerLink}`,
      );
      const warnings = dialog.getByTestId("requisites-warnings");
      const buyerLink = await warnings.getByRole("link", { name: "Fill in the recipient requisites" }).getAttribute("href");
      results.check(
        `${label}: soft warnings are listed neutrally and link to the recipient form`,
        (await warnings.innerText()).includes("Recipient tax ID") &&
          buyerLink === "/recipients?edit=recipient-1&highlight=buyer.taxId",
        buyerLink ?? "no link",
      );
      results.check(
        `${label}: the refusal is a banner, not a toast, and the dialog stays open`,
        (await page.getByText("Some requisites required for this document are missing").count()) === 0 &&
          (await page.getByRole("dialog").count()) === 1 &&
          (state.created ?? []).length === 0,
        "dialog closed or request recorded",
      );
    });
  }

  const incomplete = { ...COMPLETE_COMPANY, companyIban: "" };
  await withDocumentPage(DESKTOP, { company: incomplete }, async (page) => {
    const dialog = await openCreateDialog(page, "Invoice…");
    const banner = dialog.getByTestId("requisites-missing");
    await banner.waitFor({ state: "visible" });
    results.check(
      "the form forecasts a missing IBAN from the company data before anything is sent",
      (await banner.innerText()).includes("Seller IBAN"),
      await banner.innerText(),
    );
  });
};

const checkDocumentsSection = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, {}, async (page, state) => {
      await openDetails(page);
      await page.evaluate(() => { window.__noReload = true; });
      for (const [name, type] of [
        ["Create: Quote", "quote"],
        ["Create: Invoice", "invoice"],
        ["Create: Act of Completed Work", "act"],
        ["Create: Sales receipt", "sales_receipt"],
        ["Create: Packing list", "packing_list"],
      ]) {
        await page.getByRole("button", { name }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
        await settle(async () => (state.created ?? []).some((payload) => payload.type === type));
        await page
          .locator(`[data-document-type="${type}"]`)
          .waitFor({ state: "visible", timeout: 5000 })
          .catch(() => {});
      }
      const types = await page.locator('[data-testid="document-card"]').evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("data-document-type")),
      );
      results.check(
        `${label}: the documents section shows all five new documents without reloading the page`,
        types.sort().join(",") === "act,invoice,packing_list,quote,sales_receipt" && (await page.evaluate(() => window.__noReload === true)),
        types.join(","),
      );
      results.check(
        `${label}: only the return note is still offered once every single-instance type exists`,
        (await page.getByRole("button", { name: /^Create: / }).allInnerTexts()).map((text) => text.trim()).join("|") ===
          "Create: Return note",
        "unexpected create buttons",
      );
    });
  }
};

const RETURN_ITEMS = [
  { id: "item-dripper", order_id: "order-1", product_id: PRODUCTS[1].id, product_name: PRODUCTS[1].name, qty: 5, returned_qty: 2, unit_price_cents: 3400, line_total_cents: 17000 },
  { id: "item-beans", order_id: "order-1", product_id: PRODUCTS[2].id, product_name: PRODUCTS[2].name, qty: 2, returned_qty: 0, unit_price_cents: 2600, line_total_cents: 5200 },
];
const DRIPPER = PRODUCTS[1].name;
const BEANS = PRODUCTS[2].name;
const returnOrder = (overrides = {}) => plainOrder({ items: RETURN_ITEMS, ...overrides });

const tick = (dialog, name) => dialog.getByLabel(`Return: ${name}`, { exact: true });
const quantityOf = (dialog, name) => dialog.getByLabel(`Quantity to return: ${name}`, { exact: true });

const checkReturnNoteOffer = async (results) => {
  const fullyReturned = returnOrder({ items: RETURN_ITEMS.map((item) => ({ ...item, returned_qty: item.qty })) });
  const cases = [
    { label: "a confirmed order with units left", order: returnOrder(), isOffered: true },
    { label: "a draft order", order: returnOrder({ status: "draft" }), isOffered: false },
    { label: "an order whose units are all returned", order: fullyReturned, isOffered: false },
    {
      label: "an order that already has a return note",
      order: returnOrder({ receipts: [document("rn-1", "return_note", "generated", "2026-02-01T10:05:00.000Z")] }),
      isOffered: true,
    },
  ];
  for (const { label, order, isOffered } of cases) {
    await withDocumentPage(DESKTOP, { order }, async (page) => {
      const items = await menuOf(page);
      results.check(
        `return note is ${isOffered ? "offered" : "not offered"} for ${label}`,
        items.includes("Return note…") === isOffered,
        `menu items: ${items.join(" | ")}`,
      );
    });
  }
};

const checkReturnNoteDialog = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, { order: returnOrder() }, async (page, state) => {
      const dialog = await openCreateDialog(page, "Return note…");
      const rows = await dialog.getByTestId("return-line").evaluateAll((lines) =>
        lines.map((line) => line.innerText.replace(/\s+/g, " ").trim()),
      );
      const quantities = [await quantityOf(dialog, DRIPPER).inputValue(), await quantityOf(dialog, BEANS).inputValue()];
      results.check(
        `${label}: each line shows ordered and already returned, and the quantity defaults to what is left`,
        rows[0].startsWith(DRIPPER) && /Ordered 5 Already returned 2/.test(rows[0]) &&
          rows[1].startsWith(BEANS) && /Ordered 2 Already returned 0/.test(rows[1]) && quantities.join(",") === "3,2",
        `${JSON.stringify(rows)} ${quantities}`,
      );
      results.check(
        `${label}: nothing is ticked and the note says it is informational and does not change stock`,
        !(await tick(dialog, DRIPPER).isChecked()) &&
          /does not change stock/i.test(await dialog.getByTestId("document-create-note").innerText()) &&
          /not a fiscal document/i.test(await dialog.getByTestId("document-create-note").innerText()),
        await dialog.innerText(),
      );
      results.check(`${label}: the return note dialog fits the viewport`, await hasNoHorizontalOverflow(page), "horizontal overflow");

      await submitCreate(dialog);
      results.check(
        `${label}: submitting without a ticked line is refused on the client`,
        (await dialog.getByText("Select at least one item").count()) === 1 && (state.created ?? []).length === 0,
        await dialog.innerText(),
      );

      await tick(dialog, DRIPPER).check();
      await quantityOf(dialog, DRIPPER).fill("4");
      await submitCreate(dialog);
      results.check(
        `${label}: more than what is left is refused with the limit`,
        (await dialog.getByText("You can return no more than 3 pcs.").count()) === 1 && (state.created ?? []).length === 0,
        await dialog.innerText(),
      );
      await quantityOf(dialog, DRIPPER).fill("0");
      await submitCreate(dialog);
      results.check(
        `${label}: zero is refused`,
        (await dialog.getByText("Enter a whole number from 1 to 3").count()) === 1 && (state.created ?? []).length === 0,
        await dialog.innerText(),
      );

      await quantityOf(dialog, DRIPPER).fill("2");
      await dialog.getByLabel("Reason for the return").fill("  Damaged packaging  ");
      await submitCreate(dialog);
      await settle(() => (state.created ?? []).length === 1);
      const [sent] = state.created ?? [];
      results.check(
        `${label}: the request carries only the ticked line, the trimmed reason and the design`,
        sent?.type === "return_note" &&
          JSON.stringify(sent.details) ===
            JSON.stringify({ lines: [{ orderItemId: "item-dripper", qty: 2 }], reason: "Damaged packaging" }) &&
          sent.overrides?.templateId === "standard",
        JSON.stringify(sent),
      );
    });
  }
};

const checkReturnNoteSeveral = async (results) => {
  await withDocumentPage(DESKTOP, { order: returnOrder() }, async (page, state) => {
    await openDetails(page);
    for (const [name, qty] of [[DRIPPER, "1"], [BEANS, "2"]]) {
      await page.getByRole("button", { name: "Create: Return note" }).click();
      const dialog = page.getByRole("dialog");
      await tick(dialog, name).check();
      await quantityOf(dialog, name).fill(qty);
      await submitCreate(dialog);
      await settle(() => (state.created ?? []).length === (name === DRIPPER ? 1 : 2));
      await dialog.waitFor({ state: "hidden" });
    }
    await settle(async () => (await page.locator('[data-document-type="return_note"]').count()) === 2);
    results.check(
      "two return notes of one order are both listed",
      (await page.locator('[data-testid="document-card"][data-document-type="return_note"]').count()) === 2,
      "cards missing",
    );
    results.check(
      "the second return note was sent without the first one's lines and the first one is still listed",
      JSON.stringify(state.created.map((sent) => sent.details.lines)) ===
        JSON.stringify([[{ orderItemId: "item-dripper", qty: 1 }], [{ orderItemId: "item-beans", qty: 2 }]]),
      JSON.stringify(state.created),
    );
    await page.getByRole("button", { name: "Create: Return note" }).click();
    const dialog = page.getByRole("dialog");
    const rows = await dialog.getByTestId("return-line").evaluateAll((lines) =>
      lines.map((line) => line.innerText.replace(/\s+/g, " ").trim()),
    );
    results.check(
      "the ledger moves on: already returned counts the earlier notes and a fully returned line cannot be ticked",
      /Ordered 5 Already returned 3/.test(rows[0]) && (await tick(dialog, BEANS).isDisabled()) && rows[1].includes("Fully returned"),
      JSON.stringify(rows),
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.locator('[data-document-type="return_note"]').first().getByRole("button", { name: "Void" }).click();
    const confirm = page.getByRole("dialog", { name: "Void: Return note" });
    await confirm.waitFor({ state: "visible" });
    results.check(
      "voiding a return note says its quantities become available again",
      /available for a new return note/i.test(await confirm.innerText()),
      await confirm.innerText(),
    );
  });
};

const checkReturnNoteErrors = async (results) => {
  const exceeded = {
    status: 422,
    body: { error: "Cannot return more than was ordered", errorCode: "RETURN_QUANTITY_EXCEEDED" },
  };
  await withDocumentPage(DESKTOP, { order: returnOrder(), createError: exceeded }, async (page, state) => {
    const dialog = await openCreateDialog(page, "Return note…");
    await tick(dialog, BEANS).check();
    await submitCreate(dialog);
    await settle(() => (state.createAttempts ?? []).length === 1);
    const alert = dialog.getByRole("alert");
    await alert.first().waitFor({ state: "visible" });
    results.check(
      "RETURN_QUANTITY_EXCEEDED is explained in the dialog, which stays open and can be submitted again",
      (await alert.first().innerText()).includes("cannot return more than is left") &&
        (await page.getByRole("dialog").count()) === 1 &&
        (await dialog.getByRole("button", { name: "Create", exact: true }).isEnabled()),
      await dialog.innerText(),
    );
  });

  await withDocumentPage(DESKTOP, { order: returnOrder() }, async (page, state) => {
    const dialog = await openCreateDialog(page, "Return note…");
    await tick(dialog, BEANS).check();
    await dialog.getByRole("button", { name: "Create", exact: true }).dblclick();
    await settle(() => (state.created ?? []).length >= 1);
    await page.waitForTimeout(300);
    results.check(
      "a double click on Create issues one return note",
      (state.created ?? []).length === 1,
      JSON.stringify(state.created),
    );
  });
};

const checkRetentionConfirm = async (results) => {
  const retention = { limit: 10, count: 10, replaces: { id: "old", number: "INV-OLD-7", order_id: "o" } };
  await withDocumentPage(DESKTOP, { retention }, async (page, state) => {
    const dialog = await openCreateDialog(page, "Invoice…");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Replace the oldest document?" });
    await confirm.waitFor({ state: "visible" });
    const text = await confirm.innerText();
    results.check(
      "a full retention cap asks before creating and names the document it replaces",
      text.includes("INV-OLD-7") && text.includes("10 most recent") && !/archive/i.test(text) && (state.created ?? []).length === 0,
      text,
    );
    await confirm.getByRole("button", { name: "Cancel" }).click();
    results.check("cancelling the confirmation sends nothing", (state.created ?? []).length === 0, JSON.stringify(state.created));
    await page.getByRole("dialog", { name: "Create document: Invoice" }).getByRole("button", { name: "Create", exact: true }).click();
    await confirm.getByRole("button", { name: "Create", exact: true }).click();
    results.check(
      "confirming creates the invoice",
      await settle(() => (state.created ?? []).length === 1),
      JSON.stringify(state.created),
    );
  });
};

const checkVoid = async (results) => {
  const withInvoice = plainOrder({
    receipts: [document("inv-1", "invoice", "generated", "2026-02-01T10:05:00.000Z")],
  });
  await withDocumentPage(DESKTOP, { order: withInvoice }, async (page, state) => {
    await openDetails(page);
    await page.locator('[data-document-type="invoice"]').getByRole("button", { name: "Void" }).click();
    const confirm = page.getByRole("dialog", { name: "Void: Invoice" });
    await confirm.waitFor({ state: "visible" });
    results.check(
      "voiding an invoice says a new one can be issued under a new number",
      (await confirm.innerText()).includes("you can issue a new Invoice with a new number"),
      await confirm.innerText(),
    );
    await confirm.getByLabel("Reason (optional)").fill("Wrong amount");
    await confirm.getByRole("button", { name: "Void", exact: true }).click();
    await settle(() => (state.voided ?? []).length === 1);
    results.check(
      "the void request carries the reason",
      JSON.stringify(state.voided?.[0]) === '{"id":"inv-1","body":{"reason":"Wrong amount"}}',
      JSON.stringify(state.voided),
    );
  });
};


const checkReissueAfterVoid = async (results) => {
  const voidedInvoice = plainOrder({
    receipts: [
      { ...document("inv-1", "invoice", "void", "2026-02-01T10:05:00.000Z"), number: "INV-OLD", void_reason: "Wrong amount", voided_at: "2026-02-02T10:00:00.000Z" },
    ],
  });
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, { order: voidedInvoice }, async (page, state) => {
      await openDetails(page);
      const card = page.locator('[data-document-type="invoice"]');
      await page.getByRole("button", { name: "Create: Invoice" }).click();
      const dialog = page.getByRole("dialog");
      results.check(
        `${label}: reissuing over a voided invoice names the voided number`,
        (await dialog.getByTestId("document-reissue-note").innerText()).includes("INV-OLD"),
        await dialog.innerText(),
      );
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await settle(() => (state.created ?? []).length === 1);
      await page.locator('[data-document-type="invoice"] >> text=INVOICE-0001').waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      const cards = await page.locator('[data-testid="document-card"][data-document-type="invoice"]').count();
      results.check(
        `${label}: the new invoice is the only invoice card, and Create is gone again`,
        cards === 1 && (await page.getByRole("button", { name: "Create: Invoice" }).count()) === 0,
        `cards: ${cards}`,
      );
      const history = page.getByTestId("document-history");
      const summary = await history.locator("summary").innerText();
      await history.locator("summary").click();
      const entry = await history.getByTestId("voided-document").innerText();
      results.check(
        `${label}: the voided invoice sits under "Voided (1)" with number, date and reason`,
        summary.includes("Voided (1)") && entry.includes("INV-OLD") && entry.includes("Wrong amount") && entry.includes("voided"),
        `${summary} | ${entry}`,
      );
      results.check(
        `${label}: the history offers download only`,
        (await history.getByRole("button").allInnerTexts()).map((text) => text.trim()).join(",") === "Download",
        await history.innerText(),
      );
      results.check(
        `${label}: the new invoice card does not show the old number as current`,
        !(await card.first().locator("p.text-xs").first().innerText()).includes("INV-OLD"),
        await card.first().innerText(),
      );
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      results.check(`${label}: the history does not widen the page`, overflow <= 0, `overflow: ${overflow}px`);
    });
  }

  const superseded = plainOrder({
    receipts: [
      { ...document("inv-old", "invoice", "void", "2026-02-01T10:05:00.000Z"), number: "INV-OLD" },
      { ...document("inv-new", "invoice", "generated", "2026-02-03T10:05:00.000Z"), number: "INV-NEW" },
    ],
  });
  await withDocumentPage(DESKTOP, { order: superseded }, async (page) => {
    const badges = await page.locator("text=/Invoice · Voided|Voided/").locator("visible=true").count();
    results.check("a superseded void invoice shows no 'Voided' chip next to the live one", badges === 0, `chips: ${badges}`);
  });
};

const checkReplaceDesign = async (results) => {
  const withInvoice = plainOrder({
    receipts: [document("inv-1", "invoice", "generated", "2026-02-01T10:05:00.000Z")],
  });
  for (const { label, viewport } of VIEWPORTS) {
    // The account's saved design is thermal, which cannot carry an invoice.
    await withDocumentPage(viewport, { order: withInvoice, designId: "thermal" }, async (page) => {
      await openDetails(page);
      await page.locator('[data-document-type="invoice"]').getByRole("button", { name: "Replace" }).click();
      const dialog = page.getByRole("dialog");
      const select = dialog.getByLabel("Template", { exact: true });
      await select.waitFor({ state: "visible" });
      await settle(async () => (await select.inputValue()) !== "thermal");
      results.check(
        `${label}: replacing an invoice does not start from a design it cannot use`,
        (await select.inputValue()) === "standard",
        await select.inputValue(),
      );
      results.check(
        `${label}: thermal is not selectable for an invoice`,
        await select.locator('option[value="thermal"]').evaluate((option) => option.disabled),
        "thermal option enabled",
      );
      results.check(
        `${label}: the waybill-only preview is replaced by an explanation`,
        (await dialog.getByText("The preview only renders the waybill layout").count()) === 1 &&
          (await dialog.getByRole("button", { name: "Refresh preview" }).count()) === 0,
        "preview offered",
      );
    });
  }
};

const checkVoidedWaybill = async (results) => {
  const voided = plainOrder({
    receipts: [
      { ...document("wb-1", "waybill", "void", "2026-02-01T10:00:00.000Z"), void_reason: "Typo in the prices" },
      { ...document("inv-1", "invoice", "void", "2026-02-01T10:05:00.000Z"), void_reason: "order_cancelled" },
    ],
  });
  for (const { label, viewport } of VIEWPORTS) {
    await withDocumentPage(viewport, { order: voided }, async (page) => {
      const items = await menuOf(page);
      results.check(
        `${label}: a voided waybill cannot be generated again from the menu, a voided invoice can`,
        !items.includes("Generate waybill") && items.includes("Invoice…") && items.includes("Act of Completed Work…"),
        `menu items: ${items.join(" | ")}`,
      );
      await page.keyboard.press("Escape");
      await openDetails(page);
      results.check(
        `${label}: nor from the order details`,
        (await page.getByRole("button", { name: "Generate waybill" }).count()) === 0,
        "generate button visible",
      );
      const invoice = await page.locator('[data-document-type="invoice"]').innerText();
      const waybill = await page.locator('[data-document-type="waybill"]').innerText();
      results.check(
        `${label}: a system void reason is translated and a typed one shown as typed`,
        invoice.includes("Reason: The order was cancelled") &&
          !invoice.includes("order_cancelled") &&
          waybill.includes("Reason: Typo in the prices"),
        `${invoice} | ${waybill}`,
      );
    });
  }
};

export const run = async () => {
  const results = new Results("documents on orders");
  const socket = await startReceiptSocketServer();
  try {
    await checkWaybillButtons(results);
    await checkProcessingInvoice(results);
    await checkRetryRouting(results, socket);
    await checkRetryWithoutKnownType(results, socket);
    await checkFailedDocumentRetry(results);
    await checkBadgeWraps(results);
    await checkCreateGroup(results);
    await checkInvoiceCreation(results);
    await checkActCreation(results);
    await checkDetaillessCreation(results);
    await checkQuoteDialog(results);
    await checkQuoteClock(results);
    await checkStaleQuoteWarning(results);
    await checkQuoteVoidReissue(results);
    await checkRequisitesBanner(results);
    await checkDocumentsSection(results);
    await checkReturnNoteOffer(results);
    await checkReturnNoteDialog(results);
    await checkReturnNoteSeveral(results);
    await checkReturnNoteErrors(results);
    await checkRetentionConfirm(results);
    await checkVoid(results);
    await checkReissueAfterVoid(results);
    await checkReplaceDesign(results);
    await checkVoidedWaybill(results);
  } finally {
    await socket.close();
  }
  return results;
};
