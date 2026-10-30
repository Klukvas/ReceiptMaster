// parseApiError must find the camelCase locale key for a SCREAMING_SNAKE_CASE
// errorCode, so ru/uk users read their language instead of the English
// fallback. Unit checks import the module through the Vite dev server; the
// browser check drives the real product form against a mocked 409.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_URL,
  createState,
  installApiMocks,
  launchBrowser,
  withPage,
} from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "ru", "uk"];
const BACKEND_TEXT = "Product with name Widget already exists";
// Every ErrorCode with a locale entry; well above zero so the loop cannot pass empty.
const MIN_TRANSLATED_CODES = 20;

const readLocale = (locale) =>
  JSON.parse(
    readFileSync(
      resolve(FRONTEND, `src/locales/${locale}/translation.json`),
      "utf8",
    ),
  );

// Derived from the locale side (key → code), not by repeating the module's
// code → key conversion, so a bug in that conversion cannot hide here.
const errorCodeOf = (localeKey) =>
  localeKey.replace(/[A-Z0-9]/g, (letter) => `_${letter}`).toUpperCase();

/** parseApiError's message for every ErrorCode (plus one unknown) in `locale`. */
const parsedMessages = (page, locale) =>
  page.evaluate(
    async ({ locale, backendText }) => {
      const { parseApiError, ErrorCode } = await import(
        "/src/lib/api-errors.ts"
      );
      const { default: i18n } = await import("/src/lib/i18n.ts");
      await i18n.changeLanguage(locale);
      const parse = (errorCode) =>
        parseApiError({
          isAxiosError: true,
          response: { data: { error: backendText, errorCode } },
        }).message;
      return {
        byCode: Object.fromEntries(
          Object.values(ErrorCode).map((code) => [code, parse(code)]),
        ),
        unknown: parse("SOME_FUTURE_CODE"),
      };
    },
    { locale, backendText: BACKEND_TEXT },
  );

const unitChecks = async (results) => {
  const browser = await launchBrowser();
  const page = await (await browser.newContext()).newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    for (const locale of LOCALES) {
      const { errors } = readLocale(locale);
      const { byCode, unknown } = await parsedMessages(page, locale);
      const translated = Object.entries(errors)
        .map(([key, text]) => ({ key, text, code: errorCodeOf(key) }))
        .filter(({ code }) => code in byCode);
      const wrong = translated.filter(
        ({ code, text }) => byCode[code] !== text,
      );
      results.check(
        `${locale}: every ErrorCode with a locale entry reads that entry`,
        translated.length >= MIN_TRANSLATED_CODES && wrong.length === 0,
        `${translated.length} translated; wrong: ${wrong
          .map(({ code, key }) => `${code} (errors.${key}) → "${byCode[code]}"`)
          .join(", ")}`,
      );
      results.check(
        `${locale}: PRODUCT_ALREADY_EXISTS reads errors.productAlreadyExists`,
        byCode.PRODUCT_ALREADY_EXISTS === errors.productAlreadyExists,
        `got "${byCode.PRODUCT_ALREADY_EXISTS}"`,
      );
      results.check(
        `${locale}: an unknown code still falls back to the backend text`,
        unknown === BACKEND_TEXT,
        `got "${unknown}"`,
      );
    }
  } finally {
    await browser.close();
  }
};

const productFormShowsLocalizedConflict = async (results, locale) => {
  const { products, common, errors } = readLocale(locale);
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    page.setDefaultTimeout(5000);
    await installApiMocks(page, createState());
    // Registered after installApiMocks' script, so it wins.
    await page.addInitScript(
      (lng) => localStorage.setItem("i18nextLng", lng),
      locale,
    );
    const creates = [];
    await page.route("**/api/v1/products", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      creates.push(route.request().postDataJSON());
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: BACKEND_TEXT,
          errorCode: "PRODUCT_ALREADY_EXISTS",
        }),
      });
    });

    await page.goto(`${BASE_URL}/products`);
    await page
      .getByRole("button", { name: products.createProduct, exact: true })
      .click();
    await page.getByLabel(products.productName).fill("Widget");
    await page.getByLabel(products.purchasePrice).fill("10");
    await page.getByLabel(products.salePrice).fill("20");
    await page.getByLabel(products.quantity).fill("5");
    await page
      .getByRole("button", { name: common.create, exact: true })
      .click();

    const shown = await page
      .getByText(errors.productAlreadyExists, { exact: true })
      .waitFor()
      .then(() => true)
      .catch(() => false);
    const englishFallback = readLocale("en").errors.productAlreadyExists;
    results.check(
      `${locale}: a duplicate-name create (409) shows "${errors.productAlreadyExists}"`,
      creates.length === 1 && shown,
      `creates: ${creates.length}; English "${englishFallback}" visible: ${await page
        .getByText(englishFallback, { exact: true })
        .isVisible()}`,
    );
  });
};

export const run = async () => {
  const results = new Results("api errors");
  await unitChecks(results);
  for (const locale of ["ru", "uk"]) {
    await productFormShowsLocalizedConflict(results, locale);
  }
  return results;
};
