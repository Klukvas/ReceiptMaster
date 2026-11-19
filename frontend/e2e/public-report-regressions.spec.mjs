// Anonymous browser checks for the four public-page findings from the UI audit.
import { BASE_URL, withPage } from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";

const setup = async (page, language = "en", theme = "light") => {
  page.setDefaultTimeout(8000);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  await page.addInitScript(({ language, theme }) => {
    localStorage.setItem("i18nextLng", language);
    localStorage.setItem("theme", theme);
  }, { language, theme });
};

export const run = async () => {
  const results = new Results("public report regressions");
  for (const theme of ["light", "dark"]) {
    await withPage({ viewport: { width: 320, height: 812 } }, async (page) => {
      await setup(page, "ru", theme);
      await page.goto(`${BASE_URL}/privacy`);
      await page.locator("h1").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const size = await page.locator("h1").evaluate((heading) => ({
        headingWidth: heading.clientWidth,
        textWidth: heading.scrollWidth,
        pageWidth: document.documentElement.clientWidth,
        contentWidth: document.documentElement.scrollWidth,
      }));
      results.check(`320px ${theme}: Russian Privacy heading fits without clipping or page overflow`,
        size.textWidth <= size.headingWidth + 1 && size.contentWidth <= size.pageWidth + 1,
        JSON.stringify(size));
    });
  }

  for (const language of ["en", "ru", "uk", "de"]) {
    await withPage({ viewport: { width: 375, height: 812 } }, async (page) => {
      await setup(page, language);
      await page.goto(BASE_URL);
      await page.locator("h1").waitFor();
      const expectedLanguage = language === "de" ? "en" : language;
      results.check(`${language}: cold landing HTML language matches the rendered content`,
        await settle(() => page.evaluate((lng) => document.documentElement.lang === lng, expectedLanguage)),
        await page.locator("html").getAttribute("lang"));
      results.check(`${language}: mobile brand link has the product's accessible name`,
        await page.locator("nav").getByRole("link", { name: "receiptmaster", exact: true }).count() === 1,
        await page.locator("nav a.landing-logo").ariaSnapshot());
      const nextLanguage = language === "uk" ? "en" : "uk";
      await page.locator("nav select").selectOption(nextLanguage);
      results.check(`${language} → ${nextLanguage}: switching interface language updates HTML and OG locale`,
        await settle(() => page.evaluate(({ lng, locale }) =>
          document.documentElement.lang === lng &&
          document.querySelector('meta[property="og:locale"]')?.content === locale,
        { lng: nextLanguage, locale: nextLanguage === "uk" ? "uk_UA" : "en_US" })),
        await page.locator("html").getAttribute("lang"));
    });
  }

  await withPage({ viewport: { width: 375, height: 812 } }, async (page) => {
    await setup(page);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const hash of ["%", "%E0%A4%A", "%FF"]) {
      await page.goto(`${BASE_URL}/?fragment=${encodeURIComponent(hash)}#${hash}`);
      const landingSurvives = await settle(() => page.locator(".landing-page h1").isVisible());
      results.check(`malformed hash #${hash}: landing remains usable without URIError`,
        landingSurvives && errors.length === 0, JSON.stringify(errors));
      errors.length = 0;
    }
    await page.goto(`${BASE_URL}/?fragment=valid#how%2Dit%2Dworks`);
    results.check("valid percent-encoded anchor still scrolls to the intended section",
      await settle(() => page.locator("#how-it-works").evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        return window.scrollY > 0 && top >= 60 && top < 400;
      })), await page.locator("#how-it-works").boundingBox());
  });
  return results;
};
