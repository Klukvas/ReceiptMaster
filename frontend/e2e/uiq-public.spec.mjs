// Public pages: hash links from /blog and the legal pages land below the sticky nav, footer
// text is AA contrast in both themes and links the refund and cookie policies, reduced
// motion switches smooth scrolling off, and the language select / legal header are usable.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const NAV_HEIGHT = 68;

const setup = async (page, { theme = "light", language = "en" } = {}) => {
  page.setDefaultTimeout(8000);
  await installApiMocks(page, createState());
  await page.addInitScript(
    ({ theme: th, language: lng }) => {
      localStorage.setItem("theme", th);
      localStorage.setItem("i18nextLng", lng);
    },
    { theme, language },
  );
};

const contrastIn = (page, selector) =>
  page.evaluate((sel) => {
    const parse = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const el = document.querySelector(sel);
    let bg = el;
    while (bg && parse(getComputedStyle(bg).backgroundColor)[3] === 0) bg = bg.parentElement;
    const fg = lum(parse(getComputedStyle(el).color));
    const back = lum(parse(getComputedStyle(bg).backgroundColor));
    return (Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05);
  }, selector);

const hashScroll = async (results, width) => {
  await withPage({ viewport: { width, height: 800 } }, async (page) => {
    await setup(page);
    // Record how the app scrolls: a route change that glides can undo the jump to a hash target.
    await page.addInitScript(() => {
      window.__scrollCalls = [];
      const native = window.scrollTo.bind(window);
      window.scrollTo = (...args) => {
        window.__scrollCalls.push(typeof args[0] === "object" ? args[0].behavior : "default");
        return native(...args);
      };
    });
    await page.goto(`${BASE_URL}/blog`);
    await page.locator("footer .landing-footer-links a", { hasText: "Features" }).waitFor();
    await page.locator("footer .landing-footer-links a", { hasText: "Features" }).click();
    const measure = () =>
      page.evaluate(() => ({
        top: document.getElementById("features")?.getBoundingClientRect().top ?? -1,
        scrollY: Math.round(window.scrollY),
        height: document.documentElement.scrollHeight,
      }));
    const isBelowNav = ({ top }) => top >= NAV_HEIGHT - 2 && top < 400;
    // Wait for the jump to settle rather than sleeping: the page may still be loading.
    // It must stay there for half a second: a late layout shift would move it again.
    let seen = await measure();
    let stableFor = 0;
    for (let attempt = 0; attempt < 80 && stableFor < 5; attempt += 1) {
      await page.waitForTimeout(100);
      seen = await measure();
      stableFor = isBelowNav(seen) ? stableFor + 1 : 0;
    }
    results.check(
      `${width}px: Features link from /blog lands with the section below the nav`,
      stableFor >= 5 &&
        (await page.evaluate(() => window.__scrollCalls)).every((behavior) => behavior === "instant"),
      `section top = ${seen.top}, scrollY = ${seen.scrollY}, page height = ${seen.height}, scrollTo behaviors = ${JSON.stringify(await page.evaluate(() => window.__scrollCalls))}`,
    );
  });
};

const footerContrast = async (results, width, theme) => {
  await withPage({ viewport: { width, height: 800 } }, async (page) => {
    await setup(page, { theme });
    await page.goto(`${BASE_URL}/blog`);
    await page.locator(".landing-footer-links a").first().waitFor();
    const link = await contrastIn(page, ".landing-footer-links a");
    const copy = await contrastIn(page, ".landing-footer-copy");
    results.check(
      `${width}px ${theme}: footer link and copyright contrast >= 4.5`,
      link >= 4.5 && copy >= 4.5,
      `link ${link.toFixed(2)}, copy ${copy.toFixed(2)}`,
    );
  });
};

const footerLinks = async (results) => {
  await withPage({ viewport: { width: 1280, height: 800 } }, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/blog`);
    await page.locator(".landing-footer-links a").first().waitFor();
    const hrefs = await page.$$eval(".landing-footer-links a", (as) => as.map((a) => a.getAttribute("href")));
    results.check(
      "footer links the refund and cookie policies",
      hrefs.includes("/refund-policy") && hrefs.includes("/cookie-policy"),
      hrefs.join(","),
    );
  });
};

const reducedMotion = async (results) => {
  await withPage({ viewport: { width: 1280, height: 800 } }, async (page) => {
    await setup(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${BASE_URL}/`);
    await page.locator("#features").waitFor({ state: "attached" });
    const behavior = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    results.check("reduced motion: home page scroll-behavior is auto", behavior === "auto", behavior);
  });
};

const accessibleControls = async (results, width) => {
  await withPage({ viewport: { width, height: 800 } }, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/privacy`);
    await page.locator("h1").waitFor();
    const name = await page.locator("header select").first().getAttribute("aria-label");
    results.check(`${width}px: legal header has a named language switcher`, !!name, String(name));
    const toggle = await page.locator("header button[aria-label]").count();
    results.check(`${width}px: legal header has a theme toggle`, toggle > 0);
  });
  await withPage({ viewport: { width, height: 800 } }, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/blog`);
    await page.locator("nav select").first().waitFor();
    const name = await page.locator("nav select").first().getAttribute("aria-label");
    results.check(`${width}px: landing language select has an accessible name`, !!name, String(name));
  });
};

const russianNote = async (results) => {
  await withPage({ viewport: { width: 1280, height: 800 } }, async (page) => {
    await setup(page, { language: "ru" });
    await page.goto(`${BASE_URL}/blog`);
    await page.getByTestId("blog-language-note").waitFor();
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    results.check("ru interface: blog shows a language note and html lang matches the English posts", htmlLang === "en", htmlLang);
  });
};

const touchTargets = async (results) => {
  await withPage({ viewport: { width: 375, height: 800 } }, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/blog`);
    await page.locator(".landing-footer-links a").first().waitFor();
    const heights = await page.$$eval(".landing-footer-links a", (as) => as.map((a) => a.getBoundingClientRect().height));
    results.check("375px: landing footer links are at least 44px tall", heights.every((h) => h >= 43.5), heights.join(","));
    await page.goto(`${BASE_URL}/terms`);
    await page.locator("footer a").first().waitFor();
    const legal = await page.$$eval("footer a", (as) => as.map((a) => a.getBoundingClientRect().height));
    results.check("375px: legal footer links are at least 44px tall", legal.every((h) => h >= 43.5), legal.join(","));
  });
};

export const run = async () => {
  const results = new Results("uiq-public");
  for (const width of [375, 1280]) {
    await hashScroll(results, width);
    await accessibleControls(results, width);
  }
  for (const theme of ["light", "dark"]) await footerContrast(results, 1280, theme);
  await footerContrast(results, 375, "dark");
  await footerLinks(results);
  await reducedMotion(results);
  await russianNote(results);
  await touchTargets(results);
  return results;
};
