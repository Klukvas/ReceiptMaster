// Unit checks for the product selector's popup geometry.
//
// The module is TypeScript, so it is imported through the Vite dev server the
// rest of the suite already runs against — same transform pipeline as the app.

import { chromium } from "playwright";
import { BASE_URL } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";

const PREFERRED_MAX_HEIGHT = 224;
const EDGE_MARGIN = 8;

const CASES = [
  {
    name: "roomy viewport: opens below at the anchor's width",
    anchor: { top: 200, bottom: 244, left: 400, width: 300 },
    viewport: { width: 1280, height: 900, offsetLeft: 0, offsetTop: 0, layoutHeight: 900 },
    expect: { placement: "below", width: 300, left: 400, maxHeight: PREFERRED_MAX_HEIGHT },
  },
  {
    name: "narrow viewport: width and left are clamped to the visible area",
    anchor: { top: 100, bottom: 144, left: -20, width: 360 },
    viewport: { width: 320, height: 568, offsetLeft: 0, offsetTop: 0, layoutHeight: 568 },
    expect: { placement: "below", width: 304, left: 8 },
  },
  {
    name: "anchor near the right edge: popup does not spill past it",
    anchor: { top: 100, bottom: 144, left: 260, width: 200 },
    viewport: { width: 320, height: 568, offsetLeft: 0, offsetTop: 0, layoutHeight: 568 },
    expect: { placement: "below", width: 200, left: 112 },
  },
  {
    name: "little room below: flips above the anchor",
    anchor: { top: 420, bottom: 464, left: 40, width: 240 },
    viewport: { width: 320, height: 568, offsetLeft: 0, offsetTop: 0, layoutHeight: 568 },
    expect: { placement: "above", maxHeight: PREFERRED_MAX_HEIGHT },
  },
  {
    // 74px below vs 166px above — too little below, so it flips.
    name: "keyboard open: flips to the roomier side",
    anchor: { top: 180, bottom: 224, left: 40, width: 240 },
    viewport: { width: 320, height: 312, offsetLeft: 0, offsetTop: 0, layoutHeight: 568 },
    expect: { placement: "above", maxHeight: 166 },
  },
  {
    // 154px below: enough to stay put, but less than the preferred height.
    name: "tight but usable space below: stays below with a capped height",
    anchor: { top: 100, bottom: 144, left: 40, width: 240 },
    viewport: { width: 320, height: 312, offsetLeft: 0, offsetTop: 0, layoutHeight: 568 },
    expect: { placement: "below", maxHeight: 154 },
  },
  {
    name: "shifted visual viewport (iOS): offsets are respected",
    anchor: { top: 120, bottom: 164, left: 0, width: 300 },
    viewport: { width: 300, height: 400, offsetLeft: 30, offsetTop: 60, layoutHeight: 700 },
    expect: { placement: "below", left: 38, width: 284 },
  },
];

export const run = async () => {
  const results = new Results("dropdown position");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });

    for (const testCase of CASES) {
      const style = await page.evaluate(async ({ anchor, viewport }) => {
        const { computeDropdownPosition } = await import(
          "/src/components/orders/dropdown-position.ts"
        );
        return computeDropdownPosition(anchor, viewport);
      }, testCase);

      const placement = style.top !== undefined ? "below" : "above";
      const { expect: want, viewport, name } = testCase;

      results.check(
        `${name} — placement`,
        placement === want.placement,
        `expected ${want.placement}, got ${placement} (${JSON.stringify(style)})`,
      );

      if (want.width !== undefined) {
        results.check(
          `${name} — width`,
          style.width === want.width,
          `expected width ${want.width}, got ${style.width}`,
        );
      }
      if (want.left !== undefined) {
        results.check(
          `${name} — left`,
          style.left === want.left,
          `expected left ${want.left}, got ${style.left}`,
        );
      }
      if (want.maxHeight !== undefined) {
        results.check(
          `${name} — maxHeight`,
          style.maxHeight === want.maxHeight,
          `expected maxHeight ${want.maxHeight}, got ${style.maxHeight}`,
        );
      }

      // Whatever the case, the resulting box must sit inside the visible band.
      const boxTop =
        placement === "below"
          ? style.top
          : viewport.layoutHeight - style.bottom - style.maxHeight;
      const boxBottom = boxTop + style.maxHeight;
      const fits =
        style.left >= viewport.offsetLeft + EDGE_MARGIN - 0.001 &&
        style.left + style.width <=
          viewport.offsetLeft + viewport.width - EDGE_MARGIN + 0.001 &&
        boxTop >= viewport.offsetTop + EDGE_MARGIN - 0.001 &&
        boxBottom <= viewport.offsetTop + viewport.height - EDGE_MARGIN + 0.001;
      results.check(
        `${name} — box fits the visible viewport`,
        fits,
        `box x[${style.left}, ${style.left + style.width}] y[${boxTop}, ${boxBottom}] vs visible x[${viewport.offsetLeft + EDGE_MARGIN}, ${viewport.offsetLeft + viewport.width - EDGE_MARGIN}] y[${viewport.offsetTop + EDGE_MARGIN}, ${viewport.offsetTop + viewport.height - EDGE_MARGIN}]`,
      );
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return results;
};
