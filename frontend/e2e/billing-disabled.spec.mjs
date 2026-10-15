import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const load = (path, mocks, replace = (value) => value) => {
  const source = ts.transpileModule(replace(read(path)), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => mocks[name],
    console,
  });
  return exports;
};
export const run = async () => {
  const results = new Results("disabled billing");
  const { resolveBillingEnabled } = load(
    "../src/providers/billing-enabled.ts",
    {},
  );
  for (const value of [undefined, false, "false"])
    results.check(
      `flag ${String(value)} defaults/off`,
      resolveBillingEnabled(value) === false,
    );
  for (const value of [true, "true"])
    results.check(`flag ${value} on`, resolveBillingEnabled(value) === true);
  for (const value of ["", "0", "FALSE", 1, null]) {
    let rejected = false;
    try {
      resolveBillingEnabled(value);
    } catch {
      rejected = true;
    }
    results.check(`invalid flag ${JSON.stringify(value)} rejected`, rejected);
  }
  let calls = 0;
  const { useCheckout } = load("../src/hooks/useCheckout.ts", {
    react: { useState: () => [null, () => {}] },
    "../providers/PaddleProvider": {
      usePaddle: () => ({
        billingEnabled: false,
        paddle: { Checkout: { open: () => calls++ } },
      }),
    },
    "./useTranslation": { useTranslation: () => ({ t: (x) => x }) },
    "../lib/subscriptionApi": {
      subscriptionApi: { checkout: () => calls++, portal: () => calls++ },
    },
    "react-hot-toast": { error: () => calls++ },
  });
  const checkout = useCheckout();
  await checkout.handleUpgrade("pro");
  await checkout.handleManage();
  results.check(
    "programmatic disabled checkout/portal have no effects",
    calls === 0,
  );
  for (const buildFlag of [false, true]) {
    const effects = [];
    let requests = 0;
    let sdk = 0;
    const react = {
      createContext: () => ({ Provider: "provider" }),
      useContext: () => ({}),
      useState: (x) => [x, () => {}],
      useEffect: (fn) => effects.push(fn),
      createElement: () => ({}),
    };
    const { PaddleProvider } = load(
      "../src/providers/PaddleProvider.tsx",
      {
        react,
        "@paddle/paddle-js": { initializePaddle: () => sdk++ },
        "../lib/api": {
          api: {
            get: async () => {
              requests++;
              return { data: { billingEnabled: false } };
            },
          },
        },
        "./paddle-environment": {
          resolvePaddleEnvironment: () => "production",
        },
        "./billing-enabled": { resolveBillingEnabled },
      },
      (source) =>
        source.replaceAll(
          "import.meta.env",
          JSON.stringify({
            VITE_BILLING_ENABLED: String(buildFlag),
            PROD: true,
          }),
        ),
    );
    PaddleProvider({ children: null });
    effects.forEach((fn) => fn());
    await new Promise((resolve) => setTimeout(resolve, 0));
    results.check(
      `build flag ${buildFlag}, backend OFF never initializes Paddle`,
      sdk === 0 && requests === Number(buildFlag),
    );
  }
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    const state = createState();
    await installApiMocks(page, state);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    results.check(
      "public pricing purchase surface hidden",
      (await page.locator('a[href="#pricing"]').count()) === 0 &&
        (await page.locator(".landing-pricing-card").count()) === 0,
    );
    await page.goto(BASE_URL + "/settings?tab=subscription");
    await page
      .getByText("Payments are currently unavailable.", { exact: false })
      .waitFor();
    results.check(
      "settings preserves Business plan and usage",
      /Business/.test(await page.locator("main").innerText()),
    );
    results.check(
      "settings has no purchase/manage buttons",
      (await page
        .getByRole("button", {
          name: /upgrade|manage subscription|choose pro|choose business/i,
        })
        .count()) === 0,
    );
    results.check(
      "disabled page never contacts Paddle or payment routes",
      !requests.some((url) =>
        /paddle\.com|paddle\.net|billing\/(checkout|portal)/.test(url),
      ),
    );
  });
  return results;
};
