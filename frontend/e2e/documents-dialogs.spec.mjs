// Create-document dialogs on narrow screens (375px, 640px) and desktop (1280px):
//  - the return note lists lines as cards: no sideways scroll inside the dialog, the quantity field is
//    visible and usable right after a line is ticked, the dialog explains the note is not a refund and
//    does not touch stock, and the quantity error names the maximum in en/ru/uk;
//  - the invoice due date cannot be in the past (today in the DOCUMENT time zone, not the browser's);
//    a server refusal of details.dueDate is shown as a translated text, not the server's English sentence.
// Set E2E_SHOT_DIR to also save screenshots of the dialogs.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { PRODUCTS, makeOrder } from "./support/fixtures.mjs";
import { documentHandlers } from "./support/document-mocks.mjs";

const VIEWPORTS = [
  { label: "375px", viewport: { width: 375, height: 812 } },
  { label: "640px", viewport: { width: 640, height: 900 } },
  { label: "1280px", viewport: { width: 1280, height: 900 } },
];
const SHOTS = process.env.E2E_SHOT_DIR;

const ITEMS = [
  { id: "item-a", order_id: "order-1", product_id: PRODUCTS[0].id, product_name: PRODUCTS[0].name, qty: 5, returned_qty: 2, unit_price_cents: 100, line_total_cents: 500 },
  { id: "item-b", order_id: "order-1", product_id: PRODUCTS[1].id, product_name: PRODUCTS[1].name, qty: 2, returned_qty: 0, unit_price_cents: 100, line_total_cents: 200 },
];
const FIRST = PRODUCTS[0].name;

const order = () => ({
  ...makeOrder({ id: "order-1", receiptId: "", receiptStatus: "", recipientName: "Aurora Coffee Bar" }),
  items: ITEMS,
});

const withOrdersPage = async ({ viewport, language = "en", clockAt, ...overrides }, run) =>
  withPage({ viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([order()]);
    Object.assign(state, overrides);
    state.handlers = documentHandlers(state);
    if (clockAt) await page.clock.setFixedTime(new Date(clockAt));
    await installApiMocks(page, state);
    await page.addInitScript((lng) => localStorage.setItem("i18nextLng", lng), language);
    await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().waitFor({ state: "visible" });
    return run(page, state);
  });

const openCreateDialog = async (page, name) => {
  await page.getByRole("button", { name: /More actions|^Ще$|^Ещё$/ }).first().click();
  await page.getByRole("menu").waitFor({ state: "visible" });
  await page.getByRole("menuitem", { name }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  return dialog;
};

const quantityOf = (dialog, name) => dialog.getByLabel(`Quantity to return: ${name}`, { exact: true });
const submitCreate = (dialog) => dialog.getByRole("button", { name: "Create", exact: true }).click();
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve());

/** The dialog panel never scrolls sideways and nothing inside pokes out of its right edge. */
const fitsDialog = (dialog) =>
  dialog.evaluate((panel) => {
    const edge = panel.getBoundingClientRect().right + 1;
    const pokesOut = [...panel.querySelectorAll("input, label, li")].some(
      (element) => element.getBoundingClientRect().right > edge,
    );
    return panel.scrollWidth <= panel.clientWidth + 1 && !pokesOut;
  });

const isInViewport = (page, locator) =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.left >= 0 && rect.right <= window.innerWidth;
  });

const checkReturnNoteLayout = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withOrdersPage({ viewport }, async (page, state) => {
      const dialog = await openCreateDialog(page, "Return note…");
      await dialog.getByLabel(`Return: ${FIRST}`, { exact: true }).check();
      const qty = quantityOf(dialog, FIRST);
      results.check(
        `${label}: right after ticking a line its quantity field is visible and enabled inside the screen`,
        (await qty.isEnabled()) && (await isInViewport(page, qty)) && (await qty.boundingBox()).width > 60,
        JSON.stringify(await qty.boundingBox()),
      );
      results.check(`${label}: the dialog has no sideways scroll`, await fitsDialog(dialog), "dialog overflows");
      results.check(
        `${label}: the page does not scroll sideways`,
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        "page overflows",
      );
      const text = await dialog.innerText();
      results.check(
        `${label}: the dialog says once (in its note) that the note refunds no money and changes no stock`,
        text.includes("does not refund money, does not change stock") &&
          text.split("does not change stock").length === 2,
        text,
      );
      await qty.fill("9");
      await submitCreate(dialog);
      results.check(
        `${label}: the quantity error names the maximum`,
        (await dialog.getByText("You can return no more than 3 pcs.").count()) === 1 && (state.created ?? []).length === 0,
        await dialog.innerText(),
      );
      await shot(page, `return-note-${label}`);
    });
  }
};

const checkReturnNoteLanguages = async (results) => {
  const cases = [
    { language: "uk", name: "Накладна на повернення товару…", hint: "не повертає гроші, не змінює залишки", exceeded: "Можна повернути не більше 3 шт.", invalid: "Введіть ціле число від 1 до 3" },
    { language: "ru", name: "Накладная на возврат товара…", hint: "не возвращает деньги, не меняет остатки", exceeded: "Можно вернуть не более 3 шт.", invalid: "Введите целое число от 1 до 3" },
  ];
  for (const { language, name, hint, exceeded, invalid } of cases) {
    await withOrdersPage({ viewport: VIEWPORTS[0].viewport, language }, async (page) => {
      const dialog = await openCreateDialog(page, name);
      await dialog.getByRole("checkbox").first().check();
      const text = await dialog.innerText();
      const input = dialog.locator('input[type="number"]').first();
      await input.fill("9");
      await dialog.locator('button[type="submit"]').click();
      const seenExceeded = await settle(async () => (await dialog.getByText(exceeded).count()) === 1);
      await input.fill("0");
      await dialog.locator('button[type="submit"]').click();
      const seenInvalid = await settle(async () => (await dialog.getByText(invalid).count()) === 1);
      results.check(
        `${language}: the note and both quantity errors are translated and name the maximum`,
        text.includes(hint) && seenExceeded && seenInvalid,
        `${text.includes(hint)} ${seenExceeded} ${seenInvalid}`,
      );
      await shot(page, `return-note-${language}-375`);
    });
  }
};

const checkInvoiceDueDate = async (results) => {
  // 2026-06-10 23:30 UTC is already 11 June in Kiritimati (UTC+14) but still 10 June in UTC.
  const clockAt = "2026-06-10T23:30:00.000Z";
  await withOrdersPage({ viewport: VIEWPORTS[2].viewport, clockAt, timeZone: "Pacific/Kiritimati" }, async (page, state) => {
    const dialog = await openCreateDialog(page, "Invoice…");
    await dialog.getByRole("radio", { name: "Pay by" }).check();
    const due = dialog.locator("#document-due-date");
    results.check(
      "the due date picker starts at today in the document time zone, not the browser's",
      (await due.getAttribute("min")) === "2026-06-11",
      String(await due.getAttribute("min")),
    );
    await due.fill("2026-06-10");
    await submitCreate(dialog);
    results.check(
      "a due date in the past is refused on the client with a translated message",
      (await dialog.getByText("The due date cannot be before today").count()) === 1 && (state.created ?? []).length === 0,
      await dialog.innerText(),
    );
    await due.fill("2026-06-11");
    await submitCreate(dialog);
    await settle(() => (state.created ?? []).length === 1);
    results.check(
      "today (in the document zone) is accepted and sent as dueDate",
      state.created?.[0]?.details?.dueDate === "2026-06-11",
      JSON.stringify(state.created),
    );
  });

  // The backend's typed refusal: its own errorCode and the field it concerns.
  const refusal = {
    status: 400,
    body: {
      error: "dueDate must not be before the issue date",
      errorCode: "INVOICE_DUE_DATE_BEFORE_ISSUE_DATE",
      field: "details.dueDate",
      dueDate: "2026-01-01",
      issueDate: "2026-06-10",
    },
  };
  for (const language of ["en", "uk"]) {
    await withOrdersPage({ viewport: VIEWPORTS[0].viewport, language, createError: refusal }, async (page, state) => {
      const dialog = await openCreateDialog(page, language === "en" ? "Invoice…" : "Рахунок на оплату…");
      await dialog.getByRole("radio").nth(1).check();
      const due = dialog.locator("#document-due-date");
      const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      await due.fill(future);
      await dialog.locator('button[type="submit"]').click();
      await settle(() => (state.createAttempts ?? []).length === 1);
      await settle(async () => (await due.getAttribute("aria-invalid")) === "true");
      const text = await dialog.innerText();
      const expected = language === "en" ? "This due date is not accepted" : "Такий строк оплати не приймається";
      results.check(
        `${language}: a server refusal of details.dueDate is translated and the raw English sentence is hidden`,
        text.includes(expected) && !text.includes("must not be before the issue date"),
        text,
      );
    });
  }
};

const checkRetentionNoEviction = async (results) => {
  const viewport = VIEWPORTS[2].viewport;
  for (const [label, menuName] of [["invoice", "Invoice…"], ["act", "Act of Completed Work…"]]) {
    await withOrdersPage({ viewport, retention: { limit: 10, count: 10, replaces: null } }, async (page, state) => {
      const dialog = await openCreateDialog(page, menuName);
      await submitCreate(dialog);
      await settle(() => (state.created ?? []).length === 1);
      results.check(
        `${label}: with replaces: null nothing is evicted, so there is no confirmation and the document is created`,
        (state.created ?? []).length === 1 && (await page.getByRole("dialog", { name: "Replace the oldest document?" }).count()) === 0,
        JSON.stringify(state.created),
      );
    });
  }
  await withOrdersPage(
    { viewport, retention: { limit: 10, count: 10, replaces: { id: "old", number: "QUO-0001", order_id: "o" } } },
    async (page, state) => {
      const dialog = await openCreateDialog(page, "Quote…");
      await submitCreate(dialog);
      const confirm = page.getByRole("dialog", { name: "Replace the oldest document?" });
      await confirm.waitFor({ state: "visible" });
      results.check(
        "a type that still evicts keeps its confirmation, naming the document",
        (await confirm.innerText()).includes("QUO-0001") && (state.created ?? []).length === 0,
        await confirm.innerText(),
      );
    },
  );
};

const checkSellerVatId = async (results) => {
  const company = {
    companyName: "Acme Trading", companyAddress: "1 Main Street", companyTaxId: "12345678",
    companyIban: "UA213223130000026007233566001", companySignatoryName: "Ivan Petrenko",
    companySignatoryPosition: "Director", companyVatPayer: true, companyVatId: null,
    companyTaxIdKind: "edrpou", companyLegalForm: "LLC", companyBankName: "Bank",
    companyEmail: "", companyPhone: "", companySwift: "", companyWebsite: "", companyTagline: "",
    defaultPaymentTermDays: 14,
  };
  for (const [label, menuName] of [["invoice", "Invoice…"], ["act", "Act of Completed Work…"]]) {
    await withOrdersPage({ viewport: VIEWPORTS[2].viewport, company }, async (page) => {
      const dialog = await openCreateDialog(page, menuName);
      const notice = dialog.getByTestId("requisites-missing");
      await notice.waitFor({ state: "visible" });
      results.check(
        `${label}: a VAT payer without a VAT number is warned before sending`,
        (await notice.innerText()).includes("Seller VAT number"),
        await notice.innerText(),
      );
    });
  }
  await withOrdersPage({ viewport: VIEWPORTS[2].viewport, company: { ...company, companyVatPayer: false } }, async (page) => {
    const dialog = await openCreateDialog(page, "Act of Completed Work…");
    await dialog.getByRole("button", { name: "Create", exact: true }).waitFor({ state: "visible" });
    results.check(
      "act: a seller who is not a VAT payer is not asked for a VAT number",
      (await dialog.getByTestId("requisites-missing").count()) === 0,
      await dialog.innerText(),
    );
  });
};

export const run = async () => {
  const results = new Results("document dialogs");
  await checkReturnNoteLayout(results);
  await checkReturnNoteLanguages(results);
  await checkInvoiceDueDate(results);
  await checkRetentionNoEviction(results);
  await checkSellerVatId(results);
  return results;
};
