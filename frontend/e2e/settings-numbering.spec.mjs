// Settings > Documents > numbering, at 1280px and 375px:
//  - all seven document types are listed with the server's next number;
//  - the preview follows prefix, digits, year and start number as they are edited;
//  - a prefix that ends with a digit or has forbidden characters, and a start below the minimum, are refused
//    on the client (Save stays off);
//  - saving sends only prefix / padding / includeYear (+ startNumber when typed) and shows the server's number;
//  - a 409 NUMBERING_START_TOO_LOW and a 400 naming the prefix are shown under their own field.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { NUMBERING_TYPES, numberingHandlers, numberingSetting, documentHandlers } from "./support/document-mocks.mjs";

const VIEWPORTS = [
  { label: "1280px", viewport: { width: 1280, height: 900 } },
  { label: "375px", viewport: { width: 375, height: 812 } },
];
const YEAR = new Date().getUTCFullYear();

const withNumbering = async (viewport, stateOverrides, run) =>
  withPage({ viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.numbering = NUMBERING_TYPES.map((type) => numberingSetting(type));
    Object.assign(state, stateOverrides);
    state.handlers = [...numberingHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    await page.goto(`${BASE_URL}/settings?tab=documents`, { waitUntil: "domcontentloaded" });
    return run(page, state);
  });

const row = (page, type) => page.getByTestId(`numbering-row-${type}`);
const previewOf = (page, type) => page.getByTestId(`numbering-preview-${type}`).innerText();
const saveButton = (page, type) => row(page, type).getByRole("button", { name: "Save" });
const hasNoHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const checkRows = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withNumbering(viewport, {}, async (page) => {
      await row(page, "invoice").waitFor({ state: "visible" });
      let count = 0;
      for (const type of NUMBERING_TYPES) count += await row(page, type).count();
      results.check(`${label}: all seven document types have a numbering row`, count === 7, `rows: ${count}`);
      results.check(
        `${label}: a row starts with the server's next number`,
        (await previewOf(page, "invoice")) === `${YEAR}-000043`,
        await previewOf(page, "invoice"),
      );
      const warning = await page.getByRole("note").first().innerText();
      results.check(
        `${label}: the page warns that only new documents are affected`,
        warning.includes("new documents only") && warning.includes("already issued"),
        warning,
      );
      results.check(`${label}: Save is off until something changes`, await saveButton(page, "invoice").isDisabled(), "enabled");
      results.check(`${label}: no horizontal overflow`, await hasNoHorizontalOverflow(page), "page scrolls sideways");
    });
  }
};

const checkPreview = async (results) => {
  await withNumbering(VIEWPORTS[0].viewport, {}, async (page) => {
    const invoice = row(page, "invoice");
    await invoice.waitFor({ state: "visible" });
    await invoice.getByLabel("Prefix").fill("INV-");
    results.check("the preview shows the prefix", (await previewOf(page, "invoice")) === `INV-${YEAR}-000043`, await previewOf(page, "invoice"));
    await invoice.getByLabel("Digits in the number").selectOption("4");
    results.check("the preview follows the digit count", (await previewOf(page, "invoice")) === `INV-${YEAR}-0043`, await previewOf(page, "invoice"));
    await invoice.getByLabel("Include the year").uncheck();
    results.check("the preview drops the year", (await previewOf(page, "invoice")) === "INV-0043", await previewOf(page, "invoice"));
    await invoice.getByLabel("Start from").fill("120");
    results.check("the preview uses the typed start number", (await previewOf(page, "invoice")) === "INV-0120", await previewOf(page, "invoice"));
    results.check(
      "editing one row leaves the others alone",
      (await previewOf(page, "act")) === `${YEAR}-000043`,
      await previewOf(page, "act"),
    );
  });
};

const checkClientValidation = async (results) => {
  await withNumbering(VIEWPORTS[0].viewport, {}, async (page) => {
    const invoice = row(page, "invoice");
    await invoice.waitFor({ state: "visible" });
    await invoice.getByLabel("Prefix").fill("INV1");
    results.check(
      "a prefix ending with a digit is refused",
      (await invoice.getByRole("alert").innerText()).includes("cannot end with a digit") && (await saveButton(page, "invoice").isDisabled()),
      await invoice.innerText(),
    );
    await invoice.getByLabel("Prefix").fill("A/B");
    results.check(
      "a prefix with a slash is refused",
      (await invoice.getByRole("alert").innerText()).includes("letters, digits") && (await saveButton(page, "invoice").isDisabled()),
      await invoice.innerText(),
    );
    await invoice.getByLabel("Prefix").fill("Рах №");
    results.check("a Cyrillic prefix with a sign that is not a letter is refused", (await saveButton(page, "invoice").isDisabled()), "enabled");
    await invoice.getByLabel("Prefix").fill("РФ-");
    results.check("a Cyrillic prefix is accepted", await saveButton(page, "invoice").isEnabled(), "disabled");
    await invoice.getByLabel("Start from").fill("10");
    results.check(
      "a start number below the minimum is refused with the minimum named",
      (await invoice.getByRole("alert").innerText()).includes("at least 43") && (await saveButton(page, "invoice").isDisabled()),
      await invoice.innerText(),
    );
    await invoice.getByLabel("Start from").fill("12x");
    results.check(
      "a start number that is not a whole number is refused",
      (await invoice.getByRole("alert").innerText()).includes("whole number") && (await saveButton(page, "invoice").isDisabled()),
      await invoice.innerText(),
    );
  });
};

const checkDraftSurvivesTabSwitch = async (results) => {
  await withNumbering(VIEWPORTS[0].viewport, {}, async (page) => {
    const invoice = row(page, "invoice");
    await invoice.waitFor({ state: "visible" });
    await invoice.getByLabel("Prefix").fill("DRAFT-");
    await page.locator("#settings-tab-advanced").click();
    await invoice.waitFor({ state: "hidden" });
    await page.locator("#settings-tab-documents").click();
    await invoice.waitFor({ state: "visible" });
    results.check(
      "a numbering draft survives a trip to another settings tab",
      (await invoice.getByLabel("Prefix").inputValue()) === "DRAFT-",
      await invoice.getByLabel("Prefix").inputValue(),
    );
  });
};

const checkSave = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withNumbering(viewport, {}, async (page, state) => {
      const invoice = row(page, "invoice");
      await invoice.waitFor({ state: "visible" });
      await invoice.getByLabel("Prefix").fill("  INV-  ");
      await invoice.getByLabel("Digits in the number").selectOption("5");
      await saveButton(page, "invoice").click();
      await settle(() => (state.numberingSaves ?? []).length === 1);
      const sent = state.numberingSaves?.[0];
      results.check(
        `${label}: saving sends the trimmed prefix, digits and year flag, without a start number`,
        sent?.type === "invoice" &&
          JSON.stringify(sent.body) === JSON.stringify({ prefix: "INV-", padding: 5, includeYear: true }),
        JSON.stringify(sent),
      );
      await settle(async () => (await previewOf(page, "invoice")) === `INV-${YEAR}-00043`);
      results.check(`${label}: the saved number comes from the server`, (await previewOf(page, "invoice")) === `INV-${YEAR}-00043`, await previewOf(page, "invoice"));
      results.check(`${label}: Save is off again after saving`, await saveButton(page, "invoice").isDisabled(), "enabled");

      await invoice.getByLabel("Start from").fill("500");
      await saveButton(page, "invoice").click();
      await settle(() => (state.numberingSaves ?? []).length === 2);
      results.check(
        `${label}: a typed start number is sent`,
        state.numberingSaves?.[1]?.body?.startNumber === 500,
        JSON.stringify(state.numberingSaves?.[1]),
      );
      await settle(async () => (await previewOf(page, "invoice")) === `INV-${YEAR}-00500`);
      results.check(`${label}: the raised number is shown`, (await previewOf(page, "invoice")) === `INV-${YEAR}-00500`, await previewOf(page, "invoice"));
    });
  }
};

const checkServerRefusals = async (results) => {
  await withNumbering(
    VIEWPORTS[0].viewport,
    {
      numberingFailure: {
        status: 409,
        body: { error: "The start number must be at least 77", errorCode: "NUMBERING_START_TOO_LOW", minStart: 77 },
      },
    },
    async (page, state) => {
      const invoice = row(page, "invoice");
      await invoice.waitFor({ state: "visible" });
      await invoice.getByLabel("Start from").fill("60");
      await saveButton(page, "invoice").click();
      await settle(() => (state.numberingSaves ?? []).length === 1);
      await invoice.getByRole("alert").waitFor({ state: "visible" });
      const text = await invoice.getByRole("alert").innerText();
      results.check(
        "a 409 start-too-low is shown under the start field with the server's minimum",
        text.includes("at least 77"),
        text,
      );
      results.check(
        "the start field is marked invalid",
        (await invoice.getByLabel("Start from").getAttribute("aria-invalid")) === "true",
        "aria-invalid missing",
      );
    },
  );
  await withNumbering(
    VIEWPORTS[0].viewport,
    {
      numberingFailure: {
        status: 409,
        body: { error: "The start number must be at least 50", errorCode: "NUMBERING_START_TOO_LOW", details: { minStart: 50 } },
      },
    },
    async (page, state) => {
      const invoice = row(page, "invoice");
      await invoice.waitFor({ state: "visible" });
      await invoice.getByLabel("Start from").fill("45");
      await saveButton(page, "invoice").click();
      await settle(() => (state.numberingSaves ?? []).length === 1);
      await invoice.getByRole("alert").waitFor({ state: "visible" });
      const text = await invoice.getByRole("alert").innerText();
      const hint = await invoice.locator("#numbering-invoice-start-hint").innerText();
      results.check(
        "a 409 with details.minStart names that minimum and the start hint follows it",
        text.includes("at least 50") && hint.includes("Minimum: 50"),
        `${text} | ${hint}`,
      );
    },
  );
  await withNumbering(
    VIEWPORTS[0].viewport,
    {
      numberingFailure: {
        status: 400,
        body: { error: "Validation error for prefix: must not end with a digit", errorCode: "VALIDATION_ERROR" },
      },
    },
    async (page, state) => {
      const invoice = row(page, "invoice");
      await invoice.waitFor({ state: "visible" });
      await invoice.getByLabel("Prefix").fill("INV-");
      await saveButton(page, "invoice").click();
      await settle(() => (state.numberingSaves ?? []).length === 1);
      await invoice.getByRole("alert").waitFor({ state: "visible" });
      const text = await invoice.getByRole("alert").innerText();
      results.check(
        "a 400 naming the prefix is shown under the prefix field",
        text.includes("cannot end with a digit") && !text.includes("must not end") &&
          (await invoice.getByLabel("Prefix").getAttribute("aria-invalid")) === "true",
        text,
      );
    },
  );
};

const checkYearlyReset = async (results) => {
  const resetBox = (page, type) => row(page, type).getByLabel("Start the numbering anew every year");
  const yearBox = (page, type) => row(page, type).getByLabel("Include the year");
  await withNumbering(VIEWPORTS[0].viewport, {}, async (page, state) => {
    await row(page, "invoice").waitFor({ state: "visible" });
    results.check("the yearly restart is off by default and available while the year is on", !(await resetBox(page, "invoice").isChecked()) && !(await resetBox(page, "invoice").isDisabled()), "wrong initial state");
    await resetBox(page, "invoice").check();
    results.check(
      "the start hint then speaks about the current year",
      (await row(page, "invoice").innerText()).includes("Minimum for the current year: 43"),
      await row(page, "invoice").innerText(),
    );
    await saveButton(page, "invoice").click();
    await settle(() => (state.numberingSaves ?? []).length === 1);
    results.check(
      "turning it on sends resetEveryYear: true and nothing else changed is lost",
      JSON.stringify(state.numberingSaves[0].body) ===
        JSON.stringify({ prefix: "", padding: 6, includeYear: true, resetEveryYear: true }),
      JSON.stringify(state.numberingSaves),
    );
    await settle(async () => (await saveButton(page, "invoice").isDisabled()));
    await yearBox(page, "invoice").uncheck();
    results.check(
      "switching the year off switches the restart off and disables it with a hint",
      !(await resetBox(page, "invoice").isChecked()) &&
        (await resetBox(page, "invoice").isDisabled()) &&
        (await row(page, "invoice").innerText()).includes("only the year tells them apart") &&
        (await row(page, "invoice").innerText()).includes("Turn on “Include the year”"),
      await row(page, "invoice").innerText(),
    );
    await saveButton(page, "invoice").click();
    await settle(() => (state.numberingSaves ?? []).length === 2);
    results.check(
      "saving without the year sends resetEveryYear: false so the server accepts it",
      state.numberingSaves[1].body.includeYear === false && state.numberingSaves[1].body.resetEveryYear === false,
      JSON.stringify(state.numberingSaves[1]),
    );
    results.check("other rows keep their own switch", !(await resetBox(page, "act").isChecked()), "act row changed");
  });
  await withNumbering(
    VIEWPORTS[0].viewport,
    {
      numberingFailure: {
        status: 400,
        body: { error: "Validation error for resetEveryYear: requires includeYear", errorCode: "VALIDATION_ERROR" },
      },
    },
    async (page, state) => {
      await row(page, "invoice").waitFor({ state: "visible" });
      await resetBox(page, "invoice").check();
      await saveButton(page, "invoice").click();
      await settle(() => (state.numberingSaves ?? []).length === 1);
      const box = resetBox(page, "invoice");
      await settle(async () => (await box.getAttribute("aria-invalid")) === "true");
      const describedBy = (await box.getAttribute("aria-describedby")) ?? "";
      const errorText = await page.evaluate(
        (ids) => ids.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" | "),
        describedBy,
      );
      results.check(
        "a 400 naming resetEveryYear is linked to the checkbox (aria-invalid + aria-describedby)",
        describedBy.split(" ").length === 2 && errorText.includes("Include the year"),
        `${describedBy}: ${errorText}`,
      );
    },
  );
  await withNumbering(VIEWPORTS[1].viewport, { numbering: NUMBERING_TYPES.map((type) => numberingSetting(type, { resetEveryYear: true })) }, async (page) => {
    await row(page, "act").waitFor({ state: "visible" });
    results.check("375px: a saved yearly restart is shown checked", await resetBox(page, "act").isChecked(), "unchecked");
    results.check("375px: no horizontal overflow", await hasNoHorizontalOverflow(page), "overflow");
  });
  await withNumbering(VIEWPORTS[0].viewport, {}, async (page) => {
    await row(page, "quote").waitFor({ state: "visible" });
    await row(page, "quote").getByLabel("Prefix").fill("КП");
    results.check(
      "the preview puts a dash after a prefix that ends in a letter",
      (await previewOf(page, "quote")) === `КП-${YEAR}-000043`,
      await previewOf(page, "quote"),
    );
    await row(page, "quote").getByLabel("Prefix").fill("A.");
    results.check("a prefix that ends in a separator is used as typed", (await previewOf(page, "quote")) === `A.${YEAR}-000043`, await previewOf(page, "quote"));
    await row(page, "quote").getByLabel("Prefix").fill("A ");
    results.check("a trailing space is trimmed on save, so the dash is added after the letter", (await previewOf(page, "quote")) === `A-${YEAR}-000043`, await previewOf(page, "quote"));
    const prefixHint = await row(page, "quote").locator("#numbering-quote-prefix-hint").innerText();
    results.check(
      "the prefix hint says the trailing space becomes a hyphen",
      prefixHint.includes("trailing space") && prefixHint.includes("A-000001"),
      prefixHint,
    );
    await row(page, "quote").getByLabel("Prefix").fill("a/b");
    results.check("an invalid prefix is not shown as a number example", (await previewOf(page, "quote")) === "—", await previewOf(page, "quote"));
  });
};

const checkUkrainianExample = async (results) => {
  await withPage({ viewport: VIEWPORTS[0].viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.numbering = NUMBERING_TYPES.map((type) => numberingSetting(type));
    state.handlers = [...numberingHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "uk"));
    await page.goto(`${BASE_URL}/settings?tab=documents`, { waitUntil: "domcontentloaded" });
    const hint = row(page, "invoice").locator("#numbering-invoice-prefix-hint");
    await hint.waitFor({ state: "visible" });
    // The example follows the row's own format (6 digits, with the year), not a fixed "0001".
    results.check("uk: the prefix hint uses a Ukrainian example (РН-)", (await hint.innerText()).includes(`РН-${YEAR}-000001`), await hint.innerText());
  });
};

export const run = async () => {
  const results = new Results("settings numbering");
  await checkUkrainianExample(results);
  await checkRows(results);
  await checkPreview(results);
  await checkClientValidation(results);
  await checkDraftSurvivesTabSwitch(results);
  await checkSave(results);
  await checkServerRefusals(results);
  await checkYearlyReset(results);
  return results;
};
