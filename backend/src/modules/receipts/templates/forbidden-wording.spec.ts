import * as fs from "fs";
import * as path from "path";

/**
 * The sales receipt is a non-fiscal document. Nothing the product shows may call a
 * document a cash-register or fiscal receipt; this regex is the only place those words live.
 */
// "скасовано" (cancelled) contains "касов", so the stem must start a word.
const FORBIDDEN =
  /(?<!\p{L})(касов|кассов)|\bcash\b|fiscal receipt|фіскальн\S* чек|фискальн\S* чек/iu;

const BACKEND_FILES = [
  path.join(__dirname, "translations/document-labels.ts"),
  path.join(__dirname, "../document-types.ts"),
  ...fs
    .readdirSync(path.join(__dirname, "html"))
    .filter((file) => file.endsWith(".html"))
    .map((file) => path.join(__dirname, "html", file)),
];

const LOCALES_DIR = path.join(__dirname, "../../../../../frontend/src/locales");
const LOCALE_FILES = fs.existsSync(LOCALES_DIR)
  ? fs
      .readdirSync(LOCALES_DIR)
      .map((language) => path.join(LOCALES_DIR, language, "translation.json"))
      .filter((file) => fs.existsSync(file))
  : [];

describe("forbidden document wording", () => {
  it("lets the notice through", () => {
    for (const notice of [
      "Не є фіскальним документом",
      "Не является фискальным документом",
      "Not a fiscal document",
      "Документ підтверджує повернення товару покупцем. Не є фіскальним документом і не є розрахунком коригування до податкової накладної.",
      "Документ подтверждает возврат товара покупателем. Не является фискальным документом и не является расчётом корректировки к налоговой накладной.",
      "This document confirms that the buyer returned the goods. It is not a fiscal document and not an adjustment calculation to a tax invoice.",
    ])
      expect(notice).not.toMatch(FORBIDDEN);
  });

  it("catches the words it is meant to", () => {
    for (const bad of [
      "Касовий чек",
      "Кассовый чек",
      "Cash receipt",
      "Fiscal receipt",
    ])
      expect(bad).toMatch(FORBIDDEN);
  });

  it.each(BACKEND_FILES)("%s uses none of them", (file) => {
    expect(fs.readFileSync(file, "utf-8")).not.toMatch(FORBIDDEN);
  });

  it.each(LOCALE_FILES)("%s uses none of them", (file) => {
    expect(fs.readFileSync(file, "utf-8")).not.toMatch(FORBIDDEN);
  });
});
