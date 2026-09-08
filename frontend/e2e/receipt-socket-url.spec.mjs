// Unit checks for where the receipt socket connects.
//
// Deployments only set VITE_API_URL; the previous hard-coded localhost default
// meant production browsers dialled their own machine and never heard that a
// receipt was done.

import { chromium } from "playwright";
import { BASE_URL } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const CASES = [
  {
    name: "explicit VITE_WS_URL always wins",
    args: ["https://ws.example.test", "/api/v1", "https://app.example.test"],
    expected: "https://ws.example.test",
  },
  {
    name: "absolute API URL: socket follows the API origin",
    args: [undefined, "http://localhost:3000/api/v1", "http://localhost:5173"],
    expected: "http://localhost:3000",
  },
  {
    name: "absolute API URL on another host: same origin as the API",
    args: [undefined, "https://api.example.test:8443/api/v1", "https://app.example.test"],
    expected: "https://api.example.test:8443",
  },
  {
    name: "proxied API (relative URL): socket uses the page origin",
    args: [undefined, "/api/v1", "https://app.example.test"],
    expected: "https://app.example.test",
  },
  {
    name: "no API URL configured: socket uses the page origin",
    args: [undefined, undefined, "https://app.example.test"],
    expected: "https://app.example.test",
  },
];

export const run = async () => {
  const results = new Results("receipt socket url");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });

    for (const testCase of CASES) {
      const actual = await page.evaluate(async (args) => {
        const { resolveSocketUrl } = await import("/src/hooks/useReceiptSocket.ts");
        return resolveSocketUrl(...args);
      }, testCase.args);

      results.check(
        testCase.name,
        actual === testCase.expected,
        `expected ${testCase.expected}, got ${actual}`,
      );
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return results;
};
