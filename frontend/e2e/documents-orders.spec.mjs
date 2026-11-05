// Regression for orders that carry several documents (waybill, invoice, act),
// at 1280px and 375px:
//  - download / print / share / customize keep acting on the waybill, never on
//    an invoice or act that happens to come first in `order.receipts`;
//  - a processing invoice shows its own chip and does not hide the waybill;
//  - retrying a failed invoice goes to POST .../documents, not the waybill route;
//  - the "Create document" menu group (invoice, act) follows the order status and the
//    documents it already has; creating sends one of dueDate / paymentTermDays;
//  - a missing-requisites 422 becomes a banner with links, not a toast;
//  - the documents section of the details shows new documents without a reload;
//  - the retention confirmation names the document that would be replaced;
//  - voiding any document warns that it cannot be issued again; a voided waybill is not
//    offered for generation, and system void reasons are translated;
//  - replacing an invoice never offers (or starts from) a design that cannot carry it.

import {
  BASE_URL,
  createState,
  installApiMocks,
  startReceiptSocketServer,
  withPage,
} from "./support/harness.mjs";
import { Results, settle, waitFor } from "./support/runner.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { COMPLETE_COMPANY, documentHandlers } from "./support/document-mocks.mjs";

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
          "the invoice retry sends its type with empty details",
          bodies.some((body) => body.includes('"type":"invoice"') && body.includes('"details":{}')),
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
const withDocumentPage = async (viewport, { order = plainOrder(), ...stateOverrides }, run) =>
  withPage({ viewport }, async (page) => {
    const state = createState([order]);
    Object.assign(state, stateOverrides);
    state.handlers = documentHandlers(state);
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
        `${label}: a draft order offers no document creation`,
        !items.some((item) => /^(Invoice|Act of Completed Work|Sales receipt|Packing list)…/.test(item)) &&
          (await page.getByRole("group", { name: "Create document" }).count()) === 0,
        `menu items: ${items.join(" | ")}`,
      );
    });

    await withDocumentPage(viewport, {}, async (page) => {
      const items = await menuOf(page);
      const group = page.getByRole("group", { name: "Create document" });
      results.check(
        `${label}: a confirmed order lists invoice, act, sales receipt and packing list under "Create document", beside the one-click waybill`,
        items.includes("Generate waybill") &&
          (await group.getByRole("menuitem").allInnerTexts()).map((text) => text.trim()).join("|") ===
            "Invoice…|Act of Completed Work…|Sales receipt…|Packing list…",
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
    await dialog.getByLabel("Pay by").fill("2026-03-15");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await settle(() => (state.created ?? []).length === 1);
    results.check(
      "choosing a due date sends dueDate and no paymentTermDays",
      JSON.stringify(state.created?.[0]?.details) === '{"dueDate":"2026-03-15"}',
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
        `${label}: the documents section shows all four new documents without reloading the page`,
        types.sort().join(",") === "act,invoice,packing_list,sales_receipt" && (await page.evaluate(() => window.__noReload === true)),
        types.join(","),
      );
      results.check(
        `${label}: nothing left to create once all exist`,
        (await page.getByRole("button", { name: /^Create: / }).count()) === 0,
        "create buttons still visible",
      );
    });
  }
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
      "voiding an invoice warns that another one cannot be issued",
      (await confirm.innerText()).includes("cannot issue another document of this type"),
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
        `${label}: a voided waybill cannot be generated again from the menu`,
        !items.includes("Generate waybill") && !items.includes("Invoice…") && items.includes("Act of Completed Work…"),
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
    await checkRequisitesBanner(results);
    await checkDocumentsSection(results);
    await checkRetentionConfirm(results);
    await checkVoid(results);
    await checkReplaceDesign(results);
    await checkVoidedWaybill(results);
  } finally {
    await socket.close();
  }
  return results;
};
