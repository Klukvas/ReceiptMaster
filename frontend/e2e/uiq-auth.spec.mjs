// Auth and onboarding touch quality: hit boxes, no accidental commits, localized
// throttling message, single-flight submits and focus that does not land on Close.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 375, height: 700 } };
const COMPLETE_PATH = "/settings/onboarding-complete";

const json = (route, status, body) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const installOnboardingBackend = async (page) => {
  const completions = [];
  await installApiMocks(page, createState());
  await page.route("**/api/v1/settings/onboarding-**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === COMPLETE_PATH && route.request().method() === "POST") {
      completions.push(path);
      return json(route, 200, { completed: true });
    }
    return json(route, 200, { completed: completions.length > 0 });
  });
  await page.addInitScript(() => localStorage.removeItem("onboarding_dismissed"));
  return completions;
};

const openWizard = async (page) => {
  await page.goto(`${BASE_URL}/dashboard`);
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  return dialog;
};

const passwordToggle = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.goto(`${BASE_URL}/?auth=login`);
    const toggle = page
      .getByRole("dialog")
      .getByRole("button", { name: "Show password" });
    await toggle.waitFor();
    // The dialog scales in; layout size is what a finger gets once it settles.
    const box = await toggle.evaluate((element) => ({
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
    results.check(
      "login modal: the show-password toggle has a 44px hit box",
      box.width >= 44 && box.height >= 44,
      JSON.stringify(box),
    );
  });
};

const throttledLogin = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "ru"));
    await page.route("**/api/v1/auth/login", (route) =>
      json(route, 429, {
        error: "ThrottlerException: Too Many Requests",
        errorCode: "HTTP_EXCEPTION",
      }),
    );
    await page.goto(`${BASE_URL}/?auth=login`);
    const dialog = page.getByRole("dialog");
    await dialog.locator("#email").fill("someone@example.com");
    await dialog.locator("#password").fill("whatever-password");
    await dialog.locator("button[type=submit]").click();
    const alert = dialog.getByRole("alert").first();
    await alert.waitFor();
    const text = (await alert.innerText()).trim();
    results.check(
      "login: a 429 reads as a localized message in Russian, not the raw exception",
      text.includes("Слишком много попыток") && !text.includes("Throttler"),
      text,
    );
  });
};

const doubleSubmit = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    let loginRequests = 0;
    await page.route("**/api/v1/auth/login", async (route) => {
      loginRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return json(route, 401, { error: "Invalid", errorCode: "INVALID_CREDENTIALS" });
    });
    await page.goto(`${BASE_URL}/?auth=login`);
    const dialog = page.getByRole("dialog");
    await dialog.locator("#email").fill("someone@example.com");
    await dialog.locator("#password").fill("whatever-password");
    await page.evaluate(() => {
      const submit = document.querySelector("[role=dialog] button[type=submit]");
      submit.click();
      submit.click();
      submit.click();
    });
    await dialog.getByRole("alert").first().waitFor();
    results.check(
      "login: three clicks in one task send exactly one request",
      loginRequests === 1,
      String(loginRequests),
    );
  });
};

const modalOpensOnEmail = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.goto(`${BASE_URL}/?auth=login`);
    await page.getByRole("dialog").waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "email");
    results.check("login modal: focus starts on the email field", true);
  });
};

const inPlaceLogin = async (results) => {
  await withPage(PHONE, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.addInitScript(() => {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
    });
    await page.route("**/api/v1/auth/profile", (route) =>
      json(route, 401, { error: "Unauthorized", errorCode: "UNAUTHORIZED" }),
    );
    await page.goto(`${BASE_URL}/dashboard`);
    const submit = page.locator("form button[type=submit]");
    await submit.waitFor();
    const box = await submit.boundingBox();
    results.check(
      "in-place login on a phone: the submit button is at least 44px high",
      box !== null && box.height >= 44,
      JSON.stringify(box),
    );
    const toggle = await page.getByRole("button", { name: "Show password" }).boundingBox();
    results.check(
      "in-place login: has a 44px show-password toggle",
      toggle !== null && toggle.width >= 44 && toggle.height >= 44,
      JSON.stringify(toggle),
    );
  });
};

const onboardingDismissal = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    const completions = await installOnboardingBackend(page);
    const dialog = await openWizard(page);
    await page.waitForFunction(
      () => document.activeElement?.tagName === "INPUT",
    );
    results.check(
      "onboarding: focus opens on the first field, not on Close",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label") !== "Close"),
    );
    results.check(
      "onboarding: the dialog is named by its step title",
      (await dialog.getAttribute("aria-labelledby")) !== null &&
        (await page.getByRole("dialog", { name: "Company Information" }).count()) === 1,
    );
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(300);
    results.check(
      "onboarding: the X only hides the wizard and writes nothing",
      completions.length === 0,
      JSON.stringify(completions),
    );
  });

  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    const completions = await installOnboardingBackend(page);
    const dialog = await openWizard(page);
    await dialog.getByRole("button", { name: "Skip for now" }).click();
    await dialog.waitFor({ state: "hidden" });
    results.check(
      "onboarding: Skip for now is the one action that completes it",
      completions.length === 1,
      JSON.stringify(completions),
    );
  });

  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    const completions = await installOnboardingBackend(page);
    const dialog = await openWizard(page);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(300);
    results.check(
      "onboarding: Escape does not complete it either",
      completions.length === 0,
      JSON.stringify(completions),
    );
  });
};

const onboardingOnPhone = async (results) => {
  await withPage(PHONE, async (page) => {
    page.setDefaultTimeout(6000);
    await installOnboardingBackend(page);
    const dialog = await openWizard(page);
    const height = await dialog
      .getByRole("button", { name: "Skip for now" })
      .evaluate((element) => element.offsetHeight);
    results.check(
      "onboarding on a phone: Skip for now is at least 44px high",
      height >= 44,
      String(height),
    );
    const fontSize = await dialog
      .locator("input")
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    results.check(
      "onboarding on a phone: inputs are 16px so iOS does not zoom on focus",
      fontSize >= 16,
      String(fontSize),
    );
  });
};

export const run = async () => {
  const results = new Results("auth and onboarding touch quality");
  await passwordToggle(results);
  await modalOpensOnEmail(results);
  await throttledLogin(results);
  await doubleSubmit(results);
  await inPlaceLogin(results);
  await onboardingDismissal(results);
  await onboardingOnPhone(results);
  return results;
};
