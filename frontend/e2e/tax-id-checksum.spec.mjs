// Three owner-facing details around documents:
//  - the check digit of a tax code (EDRPOU / RNOKPP) is verified by a pure util, and a mismatch is
//    only a hint in the recipient form: it never blocks saving;
//  - the share dialog warns that the PDF carries the signature and stamp, but only when one is stored;
//  - the delivery style is called "Shipping note" in the en interface, like its PDF title (identifier untouched).

import {
  BASE_URL,
  createState,
  installApiMocks,
  launchBrowser,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import {
  documentHandlers,
  documentsListHandlers,
  listedDocument,
  signoffHandlers,
  signoffImage,
} from "./support/document-mocks.mjs";

const RECIPIENT_ID = "11111111-1111-4111-8111-111111111111";
const HINT = "The check digit does not match";

// Well-known real EDRPOU codes, plus codes that hit each branch of the algorithm:
// first pass (plain / shifted range), retry with weights raised by two, and the retry that gives 0.
const VALID_EDRPOU = [
  "00032129",
  "14360570",
  "21560045",
  "40081195",
  "20077720",
  "10000356",
  "10010360",
  "30000336",
  "30003970",
];
const INVALID_EDRPOU = [
  "14360571",
  "40081190",
  "10000357",
  "30003971",
  "00000001",
];
const VALID_RNOKPP = ["2534153468"];
const INVALID_RNOKPP = ["2534153469", "1111111111"];

const checkUtil = async (results) => {
  const browser = await launchBrowser();
  const page = await (await browser.newContext()).newPage();
  try {
    await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });
    const statusOf = (value, kind = "") =>
      page.evaluate(
        async ({ value, kind }) =>
          (await import("/src/lib/tax-id-checksum.ts")).taxIdChecksumStatus(
            value,
            kind,
          ),
        { value, kind },
      );
    for (const code of [...VALID_EDRPOU, ...VALID_RNOKPP])
      results.check(
        `check digit of ${code} matches`,
        (await statusOf(code)) === true,
        String(await statusOf(code)),
      );
    for (const code of [...INVALID_EDRPOU, ...INVALID_RNOKPP])
      results.check(
        `check digit of ${code} does not match`,
        (await statusOf(code)) === false,
        String(await statusOf(code)),
      );
    for (const value of ["", "123", "1234567a", "123456789", " 14360570 "])
      results.check(
        `"${value}": ${value.trim() === "14360570" ? "trimmed and judged" : "nothing to judge"}`,
        (await statusOf(value)) === (value.trim() === "14360570" ? true : null),
        String(await statusOf(value)),
      );
    results.check(
      "a picked kind that does not fit the length is not judged",
      (await statusOf("14360571", "rnokpp")) === null,
      String(await statusOf("14360571", "rnokpp")),
    );
    const names = await page.evaluate(async () => {
      const { templateDisplayName } = await import("/src/lib/template-name.ts");
      const t = (key) => `<${key}>`;
      return [
        templateDisplayName(t, { id: "delivery", name: "Delivery Note" }),
        templateDisplayName(t, { id: "standard", name: "Standard" }),
      ];
    });
    results.check(
      "only the delivery style is renamed in the interface",
      names[0] === "<settings.templateNames.delivery>" &&
        names[1] === "Standard",
      names.join(" | "),
    );
  } finally {
    await browser.close();
  }
};

const checkRecipientHint = async (results) => {
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.handlers = documentHandlers(state);
    await installApiMocks(page, state);
    await page.goto(
      `${BASE_URL}/recipients?edit=${RECIPIENT_ID}&highlight=buyer.taxId`,
      { waitUntil: "domcontentloaded" },
    );
    const dialog = page.getByRole("dialog", { name: "Edit Recipient" });
    const taxId = page.locator('[id="requisite-buyer.taxId"]');
    await taxId.waitFor({ state: "visible" });
    const hint = dialog.getByText(HINT);

    await taxId.fill("14360571");
    results.check(
      "a code with a wrong check digit gets a hint",
      (await hint.count()) === 1,
      "no hint",
    );
    await taxId.fill("14360570");
    results.check(
      "a code with a right check digit gets none",
      (await hint.count()) === 0,
      "hint shown",
    );
    await taxId.fill("123");
    results.check(
      "a malformed code gets no checksum hint",
      (await hint.count()) === 0,
      "hint shown",
    );

    await taxId.fill("14360571");
    await dialog.getByRole("button", { name: "Update" }).click();
    const saved = await settle(
      () => (state.recipientPatches ?? []).length === 1,
    );
    results.check(
      "the hint never blocks saving",
      saved && state.recipientPatches[0].tax_id === "14360571",
      JSON.stringify(state.recipientPatches),
    );
  });
};

const checkShareNote = async (results) => {
  const order = {
    id: "o1",
    order_number: 17,
    status: "confirmed",
    recipient_name: "Aurora Coffee Bar",
  };
  const cases = [
    {
      name: "signature only",
      signoff: { signature: signoffImage("a"), stamp: null },
      expected: true,
    },
    {
      name: "stamp only",
      signoff: { signature: null, stamp: signoffImage("b") },
      expected: true,
    },
    {
      name: "nothing stored",
      signoff: { signature: null, stamp: null },
      expected: false,
    },
  ];
  for (const { name, signoff, expected } of cases) {
    await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
      page.setDefaultTimeout(8000);
      const state = createState([]);
      state.documents = [
        listedDocument("a1", "invoice", "generated", order, {
          created_at: "2026-03-10T10:00:00.000Z",
        }),
      ];
      state.signoff = signoff;
      state.handlers = [
        ...signoffHandlers(state),
        ...documentsListHandlers(state),
        ...documentHandlers(state),
      ];
      await installApiMocks(page, state);
      await page.goto(`${BASE_URL}/documents`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("button", { name: "Share: Invoice INV-a1" })
        .locator("visible=true")
        .click();
      await settle(() => (state.shared ?? []).includes("a1"));
      const note = page.getByTestId("share-signoff-note");
      if (expected) await note.waitFor({ state: "visible" });
      else await settle(() => state.requests.includes("GET /settings/signoff"));
      const shown = await note.count();
      results.check(
        `share dialog (${name}): signature/stamp note ${expected ? "shown" : "absent"}`,
        shown === (expected ? 1 : 0) &&
          (!expected ||
            (await note.innerText()).includes("signature and stamp")),
        String(shown),
      );
      results.check(
        `share dialog (${name}): the copy-link action is still offered`,
        (await page
          .getByRole("button", { name: "Copy", exact: true })
          .count()) >= 1,
        "no copy button",
      );
    });
  }
};

export const run = async () => {
  const results = new Results("tax id checksum, share note, style name");
  await checkUtil(results);
  await checkRecipientHint(results);
  await checkShareNote(results);
  return results;
};
