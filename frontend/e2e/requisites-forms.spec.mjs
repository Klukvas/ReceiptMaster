// The seller-requisites card of the company settings and the recipient form's
// requisites block: links highlight and focus the field they name, client checks
// refuse malformed numbers, and only requisite keys / changed fields are sent.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { COMPLETE_COMPANY, documentHandlers } from "./support/document-mocks.mjs";

const VIEWPORTS = [
  { label: "1280px", viewport: { width: 1280, height: 900 } },
  { label: "375px", viewport: { width: 375, height: 812 } },
];
const RECIPIENT_ID = "11111111-1111-4111-8111-111111111111";
const REQUISITE_KEYS = [
  "companyTaxIdKind",
  "companyLegalForm",
  "companyBankName",
  "companyVatPayer",
  "companyVatId",
  "companySignatoryName",
  "companySignatoryPosition",
  "defaultPaymentTermDays",
].sort();

const withApp = async (viewport, path, stateOverrides, run) =>
  withPage({ viewport }, async (page) => {
    const state = createState([]);
    Object.assign(state, stateOverrides);
    state.handlers = documentHandlers(state);
    await installApiMocks(page, state);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    return run(page, state);
  });

const byId = (page, id) => page.locator(`[id="${id}"]`);
const hasNoHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const checkSettingsCard = async (results) => {
  const company = { ...COMPLETE_COMPANY, companyIban: "12345", companyLegalForm: null };
  for (const { label, viewport } of VIEWPORTS) {
    await withApp(
      viewport,
      "/settings?tab=company&highlight=seller.iban,seller.legalForm",
      { company },
      async (page, state) => {
        await page.getByRole("heading", { name: "Requisites for documents" }).waitFor({ state: "visible" });
        const iban = byId(page, "requisite-seller.iban");
        const legalForm = byId(page, "requisite-seller.legalForm");
        await settle(() => iban.evaluate((el) => el === document.activeElement));
        results.check(
          `${label}: ?highlight= marks the named fields and focuses the first`,
          (await iban.evaluate((el) => el === document.activeElement)) &&
            (await iban.getAttribute("class")).includes("ring-2") &&
            (await legalForm.getAttribute("class")).includes("ring-2"),
          `${await iban.getAttribute("class")} | ${await legalForm.getAttribute("class")}`,
        );
        results.check(
          `${label}: a non-Ukrainian IBAN gets a warning that it will not do for an invoice, without blocking`,
          (await page.getByText("It will not work for an invoice").count()) === 1,
          "no IBAN note",
        );
        results.check(`${label}: the page fits the viewport`, await hasNoHorizontalOverflow(page), "horizontal overflow");

        await page.getByLabel("VAT number (10 or 12 digits)").fill("123");
        await page.getByRole("button", { name: "Save requisites" }).click();
        results.check(
          `${label}: a malformed VAT number is refused on the client`,
          (await page.getByText("The VAT number must have 10 or 12 digits").count()) === 1 &&
            !(state.companySaves ?? []).length,
          JSON.stringify(state.companySaves),
        );

        await page.getByLabel("VAT number (10 or 12 digits)").fill("");
        await page.getByLabel("Legal form").fill("LLC");
        await page.getByRole("button", { name: "Save requisites" }).click();
        await settle(() => (state.companySaves ?? []).length === 1);
        const [saved] = state.companySaves ?? [];
        results.check(
          `${label}: saving sends requisite keys only`,
          saved && JSON.stringify(Object.keys(saved).sort()) === JSON.stringify(REQUISITE_KEYS) &&
            saved.companyLegalForm === "LLC",
          JSON.stringify(saved),
        );
      },
    );
  }
};

const checkCompanyTaxIdField = async (results) => {
  await withApp(VIEWPORTS[0].viewport, "/settings?tab=company", {}, async (page, state) => {
    const configSaves = [];
    state.handlers = [
      async (route, { path, method, body }, json) => {
        if (path !== "/settings/document-config" || method !== "PUT") return false;
        configSaves.push(body);
        const payload = JSON.parse(/name="payload"\r\n\r\n([\s\S]*?)\r\n--/.exec(body)[1]);
        await json(route, { data: { revision: 2, config: payload.config } });
        return true;
      },
      ...state.handlers,
    ];
    // The label names the codes the field holds; the VAT number (ІПН) has its own field.
    const taxId = page.getByRole("textbox", { name: "EDRPOU / RNOKPP", exact: true });
    await taxId.waitFor({ state: "visible" });
    results.check("company tab: the tax id field is labelled EDRPOU / RNOKPP", (await taxId.count()) === 1, "label missing");
    await taxId.fill("12345670");
    const hint = page.getByTestId("tax-id-checksum-hint");
    await hint.waitFor({ state: "visible" });
    results.check(
      "company tab: a code with a wrong check digit gets the same soft warning as the recipient form",
      (await hint.innerText()).includes("check digit"),
      await hint.innerText(),
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    await settle(() => configSaves.length === 1);
    results.check(
      "company tab: saving still works with the doubtful code (the warning does not block)",
      configSaves.length === 1 && configSaves[0].includes('"companyTaxId":"12345670"'),
      configSaves[0]?.slice(0, 300) ?? "no save",
    );
  });
};

const checkRecipientForm = async (results) => {
  const path = `/recipients?edit=${RECIPIENT_ID}&highlight=buyer.taxId`;
  for (const { label, viewport } of VIEWPORTS) {
    await withApp(viewport, path, {}, async (page, state) => {
      const dialog = page.getByRole("dialog", { name: "Edit Recipient" });
      await dialog.waitFor({ state: "visible" });
      const taxId = byId(page, "requisite-buyer.taxId");
      await taxId.waitFor({ state: "visible" });
      await settle(() => taxId.evaluate((el) => el === document.activeElement));
      results.check(
        `${label}: the "fill in the recipient requisites" link opens the form with the block open and the number focused`,
        (await taxId.evaluate((el) => el === document.activeElement)) &&
          (await taxId.getAttribute("class")).includes("ring-2"),
        "tax id not focused or not marked",
      );
      results.check(`${label}: the form fits the viewport`, await hasNoHorizontalOverflow(page), "horizontal overflow");

      await taxId.fill("123");
      await dialog.getByRole("button", { name: "Update" }).click();
      results.check(
        `${label}: a number that is neither 8 nor 10 digits is refused`,
        (await dialog.getByText("An EDRPOU has 8 digits, an RNOKPP has 10").count()) === 1 &&
          !(state.recipientPatches ?? []).length,
        JSON.stringify(state.recipientPatches),
      );

      await taxId.fill("12345678");
      await dialog.getByRole("button", { name: "Update" }).click();
      await settle(() => (state.recipientPatches ?? []).length === 1);
      const [patch] = state.recipientPatches ?? [];
      results.check(
        `${label}: only the changed requisite is sent`,
        patch?.tax_id === "12345678" &&
          !("legal_name" in patch) && !("iban" in patch) && !("bank_name" in patch) && !("legal_address" in patch),
        JSON.stringify(patch),
      );
    });
  }

  await withApp(VIEWPORTS[0].viewport, path, { recipientFields: { legal_name: "Aurora LLC", iban: "UA213223130000026007233566001" } }, async (page, state) => {
    const dialog = page.getByRole("dialog", { name: "Edit Recipient" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByLabel("Legal name").fill("");
    await dialog.getByRole("button", { name: "Update" }).click();
    await settle(() => (state.recipientPatches ?? []).length === 1);
    results.check(
      "clearing a requisite sends null for it and nothing else",
      JSON.stringify(state.recipientPatches?.[0]?.legal_name) === "null" && !("iban" in (state.recipientPatches?.[0] ?? {})),
      JSON.stringify(state.recipientPatches),
    );
  });
};

export const run = async () => {
  const results = new Results("requisites forms");
  await checkSettingsCard(results);
  await checkCompanyTaxIdField(results);
  await checkRecipientForm(results);
  return results;
};
