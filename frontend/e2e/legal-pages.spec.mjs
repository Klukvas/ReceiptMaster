// The four legal pages follow the interface language (en/ru/uk) and fall back
// to English for any other language. The translations are unreviewed, so this
// also pins what must never drift between them: the section structure, links,
// and the operator's identity.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const VIEWPORT = { width: 1024, height: 768 };
const PAGES = [
  { path: "/terms", title: { en: "Terms of Service", ru: "Условия", uk: "Умови" } },
  { path: "/privacy", title: { en: "Privacy Policy", ru: "конфиденциальности", uk: "конфіденційності" } },
  { path: "/refund-policy", title: { en: "Refund Policy", ru: "возврата", uk: "повернення" } },
  { path: "/cookie-policy", title: { en: "Cookie Policy", ru: "cookie", uk: "cookie" } },
];
const LANGUAGES = ["en", "ru", "uk"];

const CYRILLIC = /[Ѐ-ӿ]/g;
const UKRAINIAN_ONLY = /[іїєґІЇЄҐ]/g;
const RUSSIAN_ONLY = /[ыэъёЫЭЪЁ]/g;
const count = (text, pattern) => (text.match(pattern) ?? []).length;

const readPage = async (page, path, language) => {
  await page.goto(`${BASE_URL}${path}`);
  await page.locator("h1").waitFor();
  return page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      heading: main.querySelector("h1").textContent,
      docTitle: document.title,
      htmlLang: document.documentElement.lang,
      text: main.innerText,
      structure: {
        h2: main.querySelectorAll("h2").length,
        h3: main.querySelectorAll("h3").length,
        li: main.querySelectorAll("li").length,
        tr: main.querySelectorAll("tr").length,
        p: main.querySelectorAll("p").length,
      },
      hrefs: [...main.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      footerLinks: [...document.querySelectorAll("footer a")].map(
        (a) => a.textContent,
      ),
    };
  });
};

const withLanguage = (language, run) =>
  withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(8000);
    await installApiMocks(page, createState());
    await page.addInitScript(
      (lng) => localStorage.setItem("i18nextLng", lng),
      language,
    );
    return run(page);
  });

export const run = async () => {
  const results = new Results("legal pages");
  const byPage = new Map();

  for (const language of [...LANGUAGES, "de"]) {
    await withLanguage(language, async (page) => {
      for (const { path, title } of PAGES) {
        const shown = await readPage(page, path, language);
        const expected = language === "de" ? "en" : language;
        const label = `${language} ${path}`;
        const cyrillic = count(shown.text, CYRILLIC);

        results.check(
          `${label}: heading and tab title are in ${expected}`,
          shown.heading.includes(title[expected]) &&
            shown.docTitle.includes(title[expected]),
          `${shown.heading} | ${shown.docTitle}`,
        );
        results.check(
          `${label}: body is ${expected === "en" ? "English (no Cyrillic)" : "mostly Cyrillic"}`,
          expected === "en" ? cyrillic === 0 : cyrillic > shown.text.length / 3,
          `${cyrillic} Cyrillic characters of ${shown.text.length}`,
        );
        if (expected === "ru")
          results.check(
            `${label}: Russian, not Ukrainian`,
            count(shown.text, UKRAINIAN_ONLY) === 0,
            "found Ukrainian-only letters",
          );
        if (expected === "uk")
          results.check(
            `${label}: Ukrainian, not Russian`,
            count(shown.text, UKRAINIAN_ONLY) > 20 &&
              count(shown.text, RUSSIAN_ONLY) === 0,
            "found Russian-only letters or no Ukrainian ones",
          );
        results.check(
          `${label}: <html lang> is ${expected}`,
          shown.htmlLang === expected,
          shown.htmlLang,
        );
        results.check(
          `${label}: dated 2026 and names the operator`,
          /2026/.test(shown.text) && /Pavlenko Andrii Volodymyrovych/.test(shown.text),
          shown.text.slice(0, 200),
        );
        results.check(
          `${label}: footer links to the four policies in ${expected}`,
          shown.footerLinks.length === 4 &&
            (expected === "en"
              ? shown.footerLinks.every((text) => count(text, CYRILLIC) === 0)
              : shown.footerLinks.every((text) => count(text, CYRILLIC) > 0 || /cookie/i.test(text))),
          shown.footerLinks.join(" | "),
        );
        byPage.set(`${path}:${language}`, shown);
      }
    });
  }

  for (const { path } of PAGES) {
    const english = byPage.get(`${path}:en`);
    for (const language of ["ru", "uk", "de"]) {
      const other = byPage.get(`${path}:${language}`);
      results.check(
        `${language} ${path}: same sections, lists, tables and links as English`,
        JSON.stringify(other.structure) === JSON.stringify(english.structure) &&
          JSON.stringify(other.hrefs) === JSON.stringify(english.hrefs),
        `${JSON.stringify(other.structure)} vs ${JSON.stringify(english.structure)}`,
      );
    }
  }
  return results;
};
