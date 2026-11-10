// Settings > Documents > signature and stamp, at 1280px and 375px:
//  - the stored images are previewed through a blob URL that is revoked when it is replaced;
//  - a file of the wrong type or over 2 MiB is refused on the client and never uploaded;
//  - a valid upload is sent as the multipart field "file" to the right kind;
//  - 413 and 429 have their own messages; 400/415/422 and other refusals are localized, never the
//    server's English text;
//  - upload and delete are inert while either request runs;
//  - deleting asks for confirmation first;
//  - the styles named in the note come from the templates list (capabilities.signoff);
//  - a style that cannot print them (thermal) gets a warning, one that can does not.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { PNG_BYTES, documentHandlers, signoffHandlers, signoffImage } from "./support/document-mocks.mjs";

const VIEWPORTS = [
  { label: "1280px", viewport: { width: 1280, height: 900 } },
  { label: "375px", viewport: { width: 375, height: 812 } },
];
const TWO_MIB = 2 * 1024 * 1024;

const withSignoff = async (viewport, stateOverrides, run) =>
  withPage({ viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.signoff = { signature: signoffImage("asset-0"), stamp: null };
    state.designId = "standard";
    Object.assign(state, stateOverrides);
    state.handlers = [...signoffHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    await page.addInitScript(() => {
      window.__revoked = 0;
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => {
        window.__revoked += 1;
        revoke(url);
      };
    });
    await page.goto(`${BASE_URL}/settings?tab=documents`, { waitUntil: "domcontentloaded" });
    return run(page, state);
  });

const card = (page, kind) => page.getByTestId(`signoff-${kind}`);
const fileInput = (page, kind) => card(page, kind).locator('input[type="file"]');
const png = (name = "sign.png") => ({ name, mimeType: "image/png", buffer: PNG_BYTES });
const errorOf = (page, kind) => card(page, kind).getByRole("alert");
const hasNoHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const checkPreview = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withSignoff(viewport, {}, async (page, state) => {
      const image = card(page, "signature").getByRole("img");
      await image.waitFor({ state: "visible" });
      results.check(
        `${label}: the stored signature is previewed from a blob URL`,
        (await image.getAttribute("src"))?.startsWith("blob:") === true &&
          state.requests.includes("GET /settings/signoff/signature/image"),
        String(await image.getAttribute("src")),
      );
      results.check(
        `${label}: a missing stamp says nothing is uploaded`,
        (await card(page, "stamp").innerText()).includes("Nothing uploaded"),
        await card(page, "stamp").innerText(),
      );
      const hint = await card(page, "signature").innerText();
      results.check(
        `${label}: the size hint is shown`,
        hint.includes("transparent background") && hint.includes("800×300"),
        hint,
      );
      const note = await page.getByRole("note").filter({ hasText: "qualified" }).innerText();
      // The mock list is Standard, Thermal (no signoff), Minimal and Classic, in that order.
      results.check(
        `${label}: the note says issued documents do not change and names the styles from the templates list`,
        note.includes("already issued") && note.includes("\u201cStandard\u201d, \u201cMinimal\u201d and \u201cClassic\u201d") && !note.includes("Thermal") && !note.includes("Corporate") && note.includes("not a qualified electronic signature"),
        note,
      );
      results.check(`${label}: no horizontal overflow`, await hasNoHorizontalOverflow(page), "page scrolls sideways");
    });
  }
};

const checkClientChecks = async (results) => {
  await withSignoff(VIEWPORTS[0].viewport, {}, async (page, state) => {
    await card(page, "stamp").waitFor({ state: "visible" });
    await fileInput(page, "stamp").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await errorOf(page, "stamp").waitFor({ state: "visible" });
    results.check(
      "a file that is not PNG or JPEG is refused without an upload",
      (await errorOf(page, "stamp").innerText()).includes("PNG and JPEG") && (state.signoffUploads ?? []).length === 0,
      await errorOf(page, "stamp").innerText(),
    );
    await fileInput(page, "stamp").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(TWO_MIB + 1) });
    await settle(async () => (await errorOf(page, "stamp").innerText()).includes("2 MB"));
    results.check(
      "an image over 2 MiB is refused without an upload",
      (await errorOf(page, "stamp").innerText()).includes("2 MB") && (state.signoffUploads ?? []).length === 0,
      await errorOf(page, "stamp").innerText(),
    );
  });
};

const checkUpload = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withSignoff(viewport, {}, async (page, state) => {
      await card(page, "stamp").waitFor({ state: "visible" });
      await fileInput(page, "stamp").setInputFiles(png("stamp.png"));
      await settle(() => (state.signoffUploads ?? []).length === 1);
      const upload = state.signoffUploads?.[0];
      results.check(
        `${label}: the stamp goes to its own endpoint as the multipart field "file"`,
        upload?.kind === "stamp" && upload?.fileName === "stamp.png" && upload?.contentType === "image/png",
        JSON.stringify(upload),
      );
      await card(page, "stamp").getByRole("img").waitFor({ state: "visible" });
      results.check(`${label}: the uploaded stamp is previewed`, true, "");
      results.check(
        `${label}: the button now offers Replace`,
        (await card(page, "stamp").getByRole("button", { name: "Replace" }).count()) === 1,
        await card(page, "stamp").innerText(),
      );
    });
  }
  await withSignoff(VIEWPORTS[0].viewport, {}, async (page, state) => {
    await card(page, "signature").getByRole("img").waitFor({ state: "visible" });
    await fileInput(page, "signature").setInputFiles(png("new-sign.png"));
    await settle(() => (state.signoffUploads ?? []).length === 1);
    const revoked = await settle(() => page.evaluate(() => window.__revoked > 0));
    results.check("replacing an image revokes the old blob URL", revoked, "revokeObjectURL never called");
  });
};

const checkServerErrors = async (results) => {
  const cases = [
    { status: 413, body: { error: "Payload Too Large", errorCode: "HTTP_EXCEPTION" }, text: "2 MB" },
    { status: 429, body: { error: "Too Many Requests", errorCode: "HTTP_EXCEPTION" }, text: "Too many requests. Try again in a moment." },
    { status: 429, body: { error: "Too Many Requests", errorCode: "RATE_LIMITED", retryAfterSeconds: 12 }, text: "Try again in 12 s" },
    { status: 400, body: { error: "Validation error for stamp: not an image", errorCode: "VALIDATION_ERROR" }, text: "The image was not accepted", raw: "not an image" },
    { status: 415, body: { error: "Unsupported Media Type", errorCode: "HTTP_EXCEPTION" }, text: "The image was not accepted", raw: "Unsupported" },
    { status: 422, body: { error: "Unprocessable image", errorCode: "HTTP_EXCEPTION" }, text: "The image was not accepted", raw: "Unprocessable" },
    { status: 404, body: { error: "Cannot PUT /x", errorCode: "HTTP_EXCEPTION" }, text: "The change could not be saved", raw: "Cannot PUT" },
  ];
  for (const failure of cases) {
    await withSignoff(VIEWPORTS[0].viewport, { signoffFailure: failure }, async (page, state) => {
      await card(page, "stamp").waitFor({ state: "visible" });
      await fileInput(page, "stamp").setInputFiles(png());
      await settle(() => (state.signoffUploads ?? []).length === 1);
      await errorOf(page, "stamp").waitFor({ state: "visible" });
      const text = await errorOf(page, "stamp").innerText();
      results.check(
        `a ${failure.status} on upload is shown under the image${failure.raw ? ", localized" : ""}`,
        text.includes(failure.text) && !(failure.raw && text.includes(failure.raw)),
        text,
      );
    });
  }
};

const checkBusyControls = async (results) => {
  await withSignoff(VIEWPORTS[0].viewport, { signoffUploadDelayMs: 1500 }, async (page, state) => {
    const signature = card(page, "signature");
    await signature.getByRole("img").waitFor({ state: "visible" });
    await fileInput(page, "signature").setInputFiles(png("slow.png"));
    await settle(() => (state.signoffUploads ?? []).length === 1);
    const deleteButton = signature.getByRole("button", { name: "Delete" });
    results.check(
      "Delete is inert while the upload of the same image runs",
      (await deleteButton.getAttribute("aria-disabled")) === "true",
      String(await deleteButton.getAttribute("aria-disabled")),
    );
    await deleteButton.click({ force: true });
    results.check("a click on it opens no confirmation", (await page.getByRole("dialog").count()) === 0, "dialog opened");
    const isBack = await settle(async () => (await deleteButton.getAttribute("aria-disabled")) === null, { timeoutMs: 5000 });
    results.check("Delete comes back once the upload is done", isBack, "still inert");
  });
  // The two cards share the stored images, so a request on one makes the other inert too.
  await withSignoff(VIEWPORTS[0].viewport, { signoffUploadDelayMs: 1500 }, async (page, state) => {
    await card(page, "signature").getByRole("img").waitFor({ state: "visible" });
    await fileInput(page, "stamp").setInputFiles(png("stamp.png"));
    await settle(() => (state.signoffUploads ?? []).length === 1);
    const signatureButtons = card(page, "signature").getByRole("button");
    const states = await signatureButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-disabled") === "true" || button.disabled),
    );
    results.check(
      "while the stamp uploads, the signature card's Replace and Delete are inert",
      states.length >= 2 && states.every(Boolean),
      JSON.stringify(states),
    );
    await fileInput(page, "signature").setInputFiles(png("second.png"));
    await page.waitForTimeout(200);
    results.check(
      "a file picked on the other card meanwhile is not uploaded",
      (state.signoffUploads ?? []).length === 1,
      JSON.stringify(state.signoffUploads),
    );
    const isBack = await settle(
      async () => (await card(page, "signature").getByRole("button", { name: "Delete" }).getAttribute("aria-disabled")) === null,
      { timeoutMs: 5000 },
    );
    results.check("the other card comes back once the upload is done", isBack, "still inert");
  });
};

const checkDelete = async (results) => {
  await withSignoff(VIEWPORTS[0].viewport, {}, async (page, state) => {
    await card(page, "signature").getByRole("img").waitFor({ state: "visible" });
    await card(page, "signature").getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    results.check(
      "deleting asks first and nothing is deleted yet",
      (await dialog.innerText()).includes("Documents already issued keep their copy") && (state.signoffDeletes ?? []).length === 0,
      await dialog.innerText(),
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "hidden" });
    results.check("cancelling the confirmation deletes nothing", (state.signoffDeletes ?? []).length === 0, JSON.stringify(state.signoffDeletes));
    await card(page, "signature").getByRole("button", { name: "Delete" }).click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await settle(() => (state.signoffDeletes ?? []).length === 1);
    results.check("confirming deletes that image", JSON.stringify(state.signoffDeletes) === '["signature"]', JSON.stringify(state.signoffDeletes));
    await card(page, "signature").getByText("Nothing uploaded").waitFor({ state: "visible" });
    results.pass("the card returns to its empty state");
  });
};

const checkUkrainianDeleteWording = async (results) => {
  await withPage({ viewport: VIEWPORTS[0].viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.signoff = { signature: signoffImage("asset-0"), stamp: signoffImage("asset-1") };
    state.designId = "standard";
    state.handlers = [...signoffHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "uk"));
    await page.goto(`${BASE_URL}/settings?tab=documents`, { waitUntil: "domcontentloaded" });
    for (const [kind, title, pronoun] of [["signature", "Видалити підпис?", "його"], ["stamp", "Видалити печатку?", "її"]]) {
      await card(page, kind).getByRole("img").waitFor({ state: "visible" });
      await card(page, kind).getByRole("button", { name: "Видалити" }).click();
      const dialog = page.getByRole("dialog", { name: title });
      await dialog.waitFor({ state: "visible" });
      results.check(
        `uk: deleting the ${kind} asks "${title}" with the right gender in the body`,
        (await dialog.innerText()).includes(`міститимуть ${pronoun}.`),
        await dialog.innerText(),
      );
      await dialog.getByRole("button", { name: "Скасувати" }).click();
      await dialog.waitFor({ state: "hidden" });
    }
  });
};

const checkStyleWarning = async (results) => {
  await withSignoff(VIEWPORTS[0].viewport, { designId: "thermal" }, async (page) => {
    await page.getByTestId("signoff-style-warning").waitFor({ state: "visible" });
    results.check(
      "a style that cannot print them (thermal) is called out",
      (await page.getByTestId("signoff-style-warning").innerText()).includes("Thermal") &&
        (await page.getByTestId("signoff-style-warning").innerText()).includes("\u201cStandard\u201d, \u201cMinimal\u201d or \u201cClassic\u201d"),
      await page.getByTestId("signoff-style-warning").innerText(),
    );
  });
  await withSignoff(VIEWPORTS[0].viewport, { designId: "standard" }, async (page, state) => {
    await card(page, "signature").getByRole("img").waitFor({ state: "visible" });
    await settle(() => state.requests.includes("GET /settings/templates"));
    results.check(
      "a style that can print them raises no warning",
      (await page.getByTestId("signoff-style-warning").count()) === 0,
      "warning shown",
    );
  });
};

export const run = async () => {
  const results = new Results("settings signoff");
  await checkPreview(results);
  await checkClientChecks(results);
  await checkUpload(results);
  await checkServerErrors(results);
  await checkBusyControls(results);
  await checkDelete(results);
  await checkUkrainianDeleteWording(results);
  await checkStyleWarning(results);
  return results;
};
