// Round-2 review and UI-QA fixes for orders and documents:
//  - the order details are a real modal dialog: role, aria-modal, a name, focus inside, Tab trapped,
//    a named Close button, focus back on the opener (the row's "More actions" or the card's View);
//  - the orders list flags a failed document and a failed replacement; a voided one is neutral;
//  - a phone order card separates the number from the name; "Replacing" is said once on the card;
//  - the act period error goes away once the dates are valid; the completion hint spells out the
//    standard sentence instead of pointing at a placeholder;
//  - the requisites notice refreshes when the user comes back from the tab that fixed the data;
//  - /documents: "Create again" of a capped type asks the retention question (also when the lookup
//    fails) and confirms with a toast; a 409 DOCUMENT_NOT_VOIDABLE stays in the void dialog with Void
//    inert and refetches the list; a reversed range is explained once; sort lives in the URL; on a phone
//    the filters fold away, there is no Columns button and the first card is on screen; toasts do not
//    cover an open dialog's header on a phone; a typed date pending when Clear or Back is pressed is dropped.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import {
  COMPLETE_COMPANY,
  documentHandlers,
  documentsListHandlers,
  listedDocument,
} from "./support/document-mocks.mjs";

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

const doc = (id, type, status, extra = {}) => ({
  id,
  order_id: "order-1",
  document_type: type,
  number: `${type.toUpperCase()}-1`,
  status,
  progress: 100,
  created_at: "2026-02-01T10:00:00.000Z",
  replacement_status: null,
  ...extra,
});

const orderWith = (receipts, overrides = {}) => ({
  ...makeOrder({ id: "order-1", receiptId: "", receiptStatus: "", recipientName: "Aurora Coffee Bar" }),
  receipts,
  ...overrides,
});

const withOrders = (viewport, order, stateOverrides, run) =>
  withPage({ viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([order]);
    Object.assign(state, stateOverrides);
    state.handlers = documentHandlers(state);
    await installApiMocks(page, state);
    await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().waitFor({ state: "visible" });
    return run(page, state);
  });

const listOrder = (id, number, recipient) => ({ id, order_number: number, status: "confirmed", recipient_name: recipient });

const withDocuments = (viewport, path, documents, stateOverrides, run, { beforeGoto } = {}) =>
  withPage({ viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.documents = documents;
    Object.assign(state, stateOverrides);
    state.handlers = [...documentsListHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    if (beforeGoto) await beforeGoto(page);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    return run(page, state);
  });

const activeIn = (page, selector) =>
  page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), selector);

// ─── Order details dialog ─────────────────────────────────────────────────────

const checkOrderDetailsDialog = async (results) => {
  await withOrders(DESKTOP, orderWith([doc("wb-1", "waybill", "generated")]), {}, async (page) => {
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().click();
    const dialog = page.getByRole("dialog", { name: /Order Details #1/ });
    await dialog.waitFor({ state: "visible" });
    results.check("the order details are a dialog named after the order", (await dialog.count()) === 1, "no named dialog");
    results.check("the dialog is modal", (await dialog.getAttribute("aria-modal")) === "true", "aria-modal missing");
    await settle(() => activeIn(page, '[role="dialog"]'));
    results.check("opening moves focus inside the dialog", await activeIn(page, '[role="dialog"]'), "focus stayed outside");
    let escaped = false;
    for (let press = 0; press < 25; press += 1) {
      await page.keyboard.press("Tab");
      if (!(await activeIn(page, '[role="dialog"]'))) escaped = true;
    }
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("Shift+Tab");
      if (!(await activeIn(page, '[role="dialog"]'))) escaped = true;
    }
    results.check("Tab and Shift+Tab stay inside the dialog", !escaped, "focus left the dialog");
    results.check(
      "the close X has an accessible name",
      (await dialog.getByRole("button", { name: "Close", exact: true }).count()) >= 1,
      "no named close button",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    const returned = await settle(() =>
      page.evaluate(() => document.activeElement?.getAttribute("data-order-actions") === "order-1"),
    );
    results.check("after a row click, closing returns focus to that row's More actions button", returned, "focus lost");

    // A dialog opened on top makes the details inert, so only one dialog is exposed at a time.
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().click();
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Void" }).first().click();
    await page.getByRole("dialog", { name: /Void waybill/ }).waitFor({ state: "visible" });
    results.check(
      "with the void dialog on top, the details are hidden from assistive technology and only one dialog is exposed",
      (await page.getByRole("dialog").count()) === 1,
      `dialogs: ${await page.getByRole("dialog").count()}`,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: /Void waybill/ }).waitFor({ state: "hidden" });
    results.check("Escape closes only the top dialog", (await dialog.count()) === 1, "details closed too");
  });

  await withOrders(PHONE, orderWith([]), {}, async (page) => {
    const view = page.getByRole("button", { name: "View", exact: true }).first();
    await view.click();
    const dialog = page.getByRole("dialog", { name: /Order Details/ });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    await dialog.waitFor({ state: "hidden" });
    const onView = await settle(() => view.evaluate((element) => element === document.activeElement));
    results.check("375px: closing returns focus to the card's View button", onView, "focus lost");
    const title = await page.locator("main h3").first().innerText();
    results.check("375px: the order card separates number and name", title.replace(/\s+/g, " ").trim() === "#1 · Aurora Coffee Bar", title);
  });
};

// ─── Orders list chips and the order card ─────────────────────────────────────

const checkListChips = async (results) => {
  const order = orderWith([
    doc("inv-1", "invoice", "failed"),
    doc("wb-1", "waybill", "generated", { replacement_status: "failed" }),
    doc("q-1", "quote", "void"),
  ]);
  await withOrders(DESKTOP, order, {}, async (page) => {
    const row = page.locator("tbody tr").first();
    const text = await row.innerText();
    results.check(
      "the orders row flags a failed document and a failed replacement",
      text.includes("Invoice · Failed") && text.includes("Waybill · Replacement failed"),
      text,
    );
    const voidClass = await row.locator('[data-indicator="void"]').getAttribute("class");
    results.check(
      "a voided document is shown in a neutral style, not as a danger",
      voidClass !== null && !voidClass.includes("danger") && voidClass.includes("surface-alt"),
      String(voidClass),
    );
  });
  await withOrders(DESKTOP, orderWith([doc("wb-1", "waybill", "generated", { replacement_status: "processing" })]), {}, async (page) => {
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().click();
    const card = page.locator('[data-testid="document-card"][data-document-type="waybill"]');
    await card.waitFor({ state: "visible" });
    const said = (await card.innerText()).match(/Replacing/g) ?? [];
    results.check(
      "the order card says Replacing once (the badge); the Replace button only goes inert",
      said.length === 1 && (await card.getByRole("button", { name: "Replace" }).isDisabled()),
      await card.innerText(),
    );
  });
};

// ─── Create dialog: act period, completion hint, requisites refresh ───────────

const openCreate = async (page, item) => {
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: item }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Create", exact: true }) });
  await dialog.waitFor({ state: "visible" });
  return dialog;
};

const checkActDialog = async (results) => {
  await withOrders(DESKTOP, orderWith([]), {}, async (page) => {
    const dialog = await openCreate(page, /^Act of Completed Work/);
    const hint = dialog.locator("#document-completion-hint");
    const standard = "The work has been completed in full; the parties have no claims against each other.";
    results.check("the completion hint spells out the standard sentence while the field is empty", (await hint.innerText()).includes(standard), await hint.innerText());
    await dialog.locator("#document-completion-text").fill("Accepted.");
    results.check(
      "with custom text the hint still shows the standard sentence it replaces, with a way back",
      (await hint.innerText()).includes(standard) && (await dialog.getByTestId("completion-text-reset").count()) === 1,
      await hint.innerText(),
    );
    await dialog.locator("#document-period-from").fill("2026-03-10");
    await dialog.locator("#document-period-to").fill("2026-03-01");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    const to = dialog.locator("#document-period-to");
    await settle(async () => (await to.getAttribute("aria-invalid")) === "true");
    results.check("a reversed act period is refused under the end date", (await to.getAttribute("aria-invalid")) === "true", "no error");
    await to.fill("2026-03-20");
    const cleared = await settle(async () => (await to.getAttribute("aria-invalid")) === null && (await dialog.getByText("The end date is earlier").count()) === 0);
    results.check("the period error goes away as soon as the dates are valid, before the next submit", cleared, "error stayed");
  });
};

const checkRequisitesRefresh = async (results) => {
  const incomplete = { ...COMPLETE_COMPANY, companyIban: "" };
  await withOrders(DESKTOP, orderWith([]), { company: incomplete }, async (page, state) => {
    const dialog = await openCreate(page, "Invoice…");
    const banner = dialog.getByTestId("requisites-missing");
    await banner.waitFor({ state: "visible" });
    const before = state.requests.filter((line) => line === "GET /settings/company-info").length;
    // The user fixed the IBAN in the settings tab the notice opened, and comes back.
    state.company = COMPLETE_COMPANY;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const gone = await settle(async () => (await banner.count()) === 0);
    results.check(
      "coming back to the tab refetches the company data and the notice follows it",
      gone && state.requests.filter((line) => line === "GET /settings/company-info").length > before,
      `banner ${await banner.count()}`,
    );
  });
};

// ─── Documents page ───────────────────────────────────────────────────────────

const failedQuote = () =>
  listedDocument("f1", "quote", "failed", listOrder("o1", 17, "Aurora Coffee Bar"), { error_message: "Generation failed." });
const generatedInvoice = (id = "g1", extra = {}) =>
  listedDocument(id, "invoice", "generated", listOrder(`o-${id}`, 18, "Borys Bakery"), extra);

const checkRecreateRetention = async (results) => {
  const retention = { limit: 10, count: 10, replaces: { id: "old", number: "QUOTE-OLD", order_id: "o9" } };
  await withDocuments(DESKTOP, "/documents", [failedQuote()], { retention }, async (page, state) => {
    await page.getByRole("button", { name: /^Create again: / }).first().click();
    const confirm = page.getByRole("dialog", { name: "Replace the oldest document?" });
    await confirm.waitFor({ state: "visible" });
    results.check(
      "Create again of a capped type asks first and names the document that would go",
      (await confirm.innerText()).includes("QUOTE-OLD") && (state.created ?? []).length === 0,
      await confirm.innerText(),
    );
    await confirm.getByRole("button", { name: "Create", exact: true }).click();
    await settle(() => (state.created ?? []).length === 1);
    results.check("confirming sends the retry", state.created?.[0]?.type === "quote", JSON.stringify(state.created));
    const toast = page.getByRole("status").filter({ hasText: "Generating the document" });
    results.check("a success toast confirms it", await settle(() => toast.first().isVisible()), "no toast");
  });
  await withDocuments(DESKTOP, "/documents", [failedQuote()], { retentionError: true }, async (page, state) => {
    await page.getByRole("button", { name: /^Create again: / }).first().click();
    const confirm = page.getByRole("dialog", { name: "The oldest document may be replaced" });
    await confirm.waitFor({ state: "visible" });
    results.check(
      "a failed retention lookup still asks, in general terms, before Create again",
      (await confirm.innerText()).includes("may permanently delete") && (state.created ?? []).length === 0,
      await confirm.innerText(),
    );
  });
};

const checkVoidNotVoidable = async (results) => {
  const voidError = { status: 409, body: { error: "Not voidable", errorCode: "DOCUMENT_NOT_VOIDABLE" } };
  await withDocuments(DESKTOP, "/documents", [generatedInvoice()], { voidError }, async (page, state) => {
    await page.getByRole("button", { name: /^Void: / }).first().click();
    const dialog = page.getByRole("dialog", { name: /Void invoice/ });
    await dialog.waitFor({ state: "visible" });
    const before = (state.listQueries ?? []).length;
    await dialog.getByRole("button", { name: "Void", exact: true }).click();
    const refusal = dialog.getByTestId("void-refusal");
    await refusal.waitFor({ state: "visible" });
    const refetched = await settle(() => (state.listQueries ?? []).length > before);
    results.check(
      "a 409 DOCUMENT_NOT_VOIDABLE is shown inside the void dialog, Void goes inert and the list is refetched",
      (await refusal.innerText()).includes("not issued yet") &&
        (await dialog.getByRole("button", { name: "Void", exact: true }).getAttribute("aria-disabled")) === "true" &&
        refetched,
      `${await refusal.innerText()} | refetched=${refetched}`,
    );
  });
};

const checkReversedRangeOnce = async (results) => {
  await withDocuments(DESKTOP, "/documents?from=2026-03-10&to=2026-03-01", [generatedInvoice()], {}, async (page) => {
    await page.getByTestId("documents-range-hint").waitFor({ state: "visible" });
    results.check(
      "a reversed range is explained once, not repeated by the empty state",
      (await page.getByText(/is later than the/).count()) === 1,
      `count ${await page.getByText(/is later than the/).count()}`,
    );
  });
};

const manyDocuments = () =>
  Array.from({ length: 6 }, (_, index) =>
    generatedInvoice(`s${index}`, { number: `INV-${String(index).padStart(3, "0")}`, created_at: new Date(Date.UTC(2026, 2, 1 + index)).toISOString() }),
  );

const checkPhoneList = async (results) => {
  await withDocuments(PHONE, "/documents", manyDocuments(), {}, async (page, state) => {
    await page.getByText("INV-005").locator("visible=true").first().waitFor({ state: "visible" });
    results.check(
      "375px: there is no Columns button in the card layout",
      !(await page.getByRole("button", { name: "Columns" }).isVisible()),
      "Columns visible",
    );
    const box = await page.getByText("INV-005").locator("visible=true").first().boundingBox();
    results.check("375px: the first document card is on the first screen (812px)", box !== null && box.y + box.height < 812, JSON.stringify(box));
    results.check(
      "375px: the filter fields are folded behind a Filters button",
      (await page.locator("#documents-filters-toggle").isVisible()) && !(await page.locator("#documents-filter-type").isVisible()),
      "filters not folded",
    );
    await page.getByTestId("data-table-sort").selectOption({ label: "Number" });
    await settle(() => new URL(page.url()).searchParams.get("sort") === "number");
    const url = new URL(page.url());
    results.check(
      "375px: the sort field and direction go into the URL",
      url.searchParams.get("sort") === "number" && url.searchParams.get("order") === "asc",
      page.url(),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("INV-000").locator("visible=true").first().waitFor({ state: "visible" });
    const query = new URLSearchParams((state.listQueries ?? []).at(-1) ?? "");
    results.check(
      "375px: a reload keeps the sort",
      query.get("sortBy") === "number" && query.get("sortOrder") === "ASC" &&
        (await page.getByTestId("data-table-sort-direction").innerText()).includes("Ascending"),
      `${(state.listQueries ?? []).at(-1)}`,
    );
  });
};

const checkPhoneToast = async (results) => {
  const voidError = { status: 503, body: { error: "Service Unavailable" } };
  await withDocuments(PHONE, "/documents", [generatedInvoice()], { voidError }, async (page) => {
    await page.getByRole("button", { name: /^Void: / }).first().click();
    const dialog = page.getByRole("dialog", { name: /Void invoice/ });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Void", exact: true }).click();
    const toast = page.getByText("The document could not be voided", { exact: false }).locator("visible=true").first();
    await toast.waitFor({ state: "visible" });
    const [toastBox, closeBox, titleBox] = await Promise.all([
      toast.boundingBox(),
      dialog.getByRole("button", { name: "Close", exact: true }).boundingBox(),
      dialog.getByRole("heading").first().boundingBox(),
    ]);
    const overlaps = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    results.check(
      "375px: a toast does not cover the open dialog's title or Close button",
      toastBox !== null && !overlaps(toastBox, closeBox) && !overlaps(toastBox, titleBox),
      JSON.stringify({ toastBox, closeBox, titleBox }),
    );
  });
};

const typeDate = (page, selector, value) =>
  page.evaluate(
    ({ selector, value }) => {
      const input = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { selector, value },
  );

const checkPendingDateDropped = async (results) => {
  await withDocuments(DESKTOP, "/documents?type=invoice", [generatedInvoice()], {}, async (page, state) => {
    await page.getByText("INV-g1").locator("visible=true").first().waitFor({ state: "visible" });
    await typeDate(page, "#documents-filter-from", "2026-03-01");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.waitForTimeout(1000);
    results.check(
      "Clear filters drops a date still being typed, so it is not applied afterwards",
      !new URL(page.url()).searchParams.has("from") && !(state.listQueries ?? []).some((query) => query.includes("startDate")),
      `${page.url()} | ${(state.listQueries ?? []).join(" ; ")}`,
    );
  });
  await withDocuments(DESKTOP, "/documents?type=invoice", [generatedInvoice()], {}, async (page, state) => {
    await page.getByText("INV-g1").locator("visible=true").first().waitFor({ state: "visible" });
    await page.getByRole("link", { name: "Documents", exact: true }).first().click();
    await settle(() => !new URL(page.url()).searchParams.has("type"));
    await typeDate(page, "#documents-filter-from", "2026-03-01");
    await page.evaluate(() => history.back());
    await page.waitForTimeout(1000);
    const url = new URL(page.url());
    results.check(
      "Back drops a date still being typed, so the previous view stays as it was",
      url.searchParams.get("type") === "invoice" && !url.searchParams.has("from") &&
        !(state.listQueries ?? []).some((query) => query.includes("startDate")),
      `${page.url()} | ${(state.listQueries ?? []).join(" ; ")}`,
    );
  });
};

export const run = async () => {
  const results = new Results("documents review fixes");
  await checkOrderDetailsDialog(results);
  await checkListChips(results);
  await checkActDialog(results);
  await checkRequisitesRefresh(results);
  await checkRecreateRetention(results);
  await checkVoidNotVoidable(results);
  await checkReversedRangeOnce(results);
  await checkPhoneList(results);
  await checkPhoneToast(results);
  await checkPendingDateDropped(results);
  return results;
};
