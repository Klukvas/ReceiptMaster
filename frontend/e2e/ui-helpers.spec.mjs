// Node-only checks on pure UI helpers: the action-menu geometry (order "More actions" and
// PortalDropdown), the one-line chart labels and the catalog thresholds the product badge,
// drawer, form and dashboard widget share.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Results } from "./support/runner.mjs";
import { loadTsModule } from "./support/transpile.mjs";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const load = (path) => loadTsModule(resolve(SRC, path));

const EDGE = 8;
const DESKTOP = { width: 1280, height: 900 };
const MENU = { width: 192, height: 300 };

const MENU_CASES = [
  {
    name: "room below: opens under the trigger, right edges aligned",
    trigger: { top: 100, bottom: 132, right: 900 },
    menu: MENU,
    viewport: DESKTOP,
    expect: { top: 136, left: 708, maxHeight: undefined },
  },
  {
    // The old code assumed 520px and jumped the menu to the top of the viewport.
    name: "near the bottom: flips above, still attached to the trigger",
    trigger: { top: 800, bottom: 832, right: 900 },
    menu: MENU,
    viewport: DESKTOP,
    expect: { top: 496, left: 708, maxHeight: undefined },
  },
  {
    name: "phone landscape: taller than the viewport, so it scrolls inside",
    trigger: { top: 200, bottom: 244, right: 800 },
    menu: { width: 192, height: 520 },
    viewport: { width: 844, height: 390 },
    expect: { top: EDGE, maxHeight: 390 - 2 * EDGE },
  },
  {
    name: "no room on either side: clamped into the viewport",
    trigger: { top: 250, bottom: 282, right: 900 },
    menu: { width: 192, height: 400 },
    viewport: { width: 1280, height: 600 },
    expect: { top: 600 - EDGE - 400, maxHeight: undefined },
  },
  {
    name: "trigger at the left edge: menu stays on screen",
    trigger: { top: 100, bottom: 144, right: 100 },
    menu: MENU,
    viewport: { width: 375, height: 812 },
    expect: { left: EDGE },
  },
  {
    // ru/uk labels widen the menu past 192px.
    name: "a wider menu near the right edge: clamped to the viewport",
    trigger: { top: 100, bottom: 144, right: 370 },
    menu: { width: 300, height: 300 },
    viewport: { width: 375, height: 812 },
    expect: { left: 375 - EDGE - 300 },
  },
];

const checkMenuPosition = (results) => {
  const { computeMenuPosition } = load("lib/menu-position.ts");
  for (const { name, trigger, menu, viewport, expect } of MENU_CASES) {
    const position = computeMenuPosition(trigger, menu, viewport);
    for (const [field, want] of Object.entries(expect)) {
      results.check(
        `${name} — ${field}`,
        position[field] === want,
        `expected ${field} ${want}, got ${JSON.stringify(position)}`,
      );
    }
    const height = position.maxHeight ?? menu.height;
    results.check(
      `${name} — fits the viewport`,
      position.top >= EDGE &&
        position.top + height <= viewport.height - EDGE &&
        position.left >= EDGE &&
        position.left + menu.width <= viewport.width - EDGE,
      JSON.stringify(position),
    );
  }
};

const checkChartLabels = (results) => {
  const { truncateChartLabel, CHART_LABEL_MAX_CHARS } = load(
    "components/dashboard/chart-label.ts",
  );
  const max = CHART_LABEL_MAX_CHARS;
  results.check("a short name is kept", truncateChartLabel("Lamp") === "Lamp", "");
  const exact = "x".repeat(max);
  results.check(
    "a name of exactly the limit is kept",
    truncateChartLabel(exact) === exact,
    truncateChartLabel(exact),
  );
  for (const name of [
    "Гайка шестигранна М12 оцинкована (упаковка 100 шт.)",
    "Very-long-unbroken-product-name-without-spaces",
  ]) {
    const label = truncateChartLabel(name);
    results.check(
      `"${name.slice(0, 20)}…" is cut to one ${max}-character label`,
      Array.from(label).length <= max && label.endsWith("…") && !label.includes(" …"),
      label,
    );
  }
  const emoji = truncateChartLabel("😀".repeat(max + 5));
  results.check(
    "an emoji is never cut in half",
    Array.from(emoji).length === max && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji),
    emoji,
  );
};

const checkCatalogMetrics = (results) => {
  const metrics = load("lib/product-metrics.ts");
  const { marginPercent, marginTone, exceedsMaxPrice } = metrics;
  // The badge used >= and the drawer used >, so exactly 30% / 10% had two colours.
  const toneCases = [
    [700, 1000, 30, "good"],
    [900, 1000, 10, "fair"],
    [901, 1000, 9.9, "poor"],
    [699, 1000, 30.1, "good"],
    [0, 0, 0, "poor"],
  ];
  for (const [purchase, sale, percent, tone] of toneCases) {
    const margin = marginPercent(purchase, sale);
    results.check(
      `margin ${purchase}/${sale} is ${percent}% and ${tone}`,
      margin === percent && marginTone(margin) === tone,
      `got ${margin}% ${marginTone(margin)}`,
    );
  }
  results.check(
    "the largest storable price passes",
    !exceedsMaxPrice(21474836.47),
    "21474836.47 was refused",
  );
  results.check(
    "one cent more is refused before it reaches the server",
    exceedsMaxPrice(21474836.48),
    "21474836.48 was accepted",
  );
  results.check(
    "low stock means fewer than 10 units, as GET /products/low-stock",
    metrics.LOW_STOCK_THRESHOLD === 10,
    `got ${metrics.LOW_STOCK_THRESHOLD}`,
  );
};

export const run = async () => {
  const results = new Results("ui helpers");
  checkMenuPosition(results);
  checkChartLabels(results);
  checkCatalogMetrics(results);
  return results;
};
