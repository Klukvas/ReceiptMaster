// The onboarding wizard against a mocked API that behaves like the idempotent
// backend: a create with a known Idempotency-Key replays the stored entity.
// Every request is logged, so the checks count exactly what reached the server.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { paginated } from "./support/fixtures.mjs";
import { Results, waitFor } from "./support/runner.mjs";

const LOCALES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/locales",
);
const VIEWPORT = { width: 1280, height: 900 };
const DB_ERROR = {
  error:
    'duplicate key value violates unique constraint "IDX_products_user_name"',
  errorCode: "INTERNAL_SERVER_ERROR",
};
const STEP_HEADINGS = [
  "Company Information",
  "Receipt Design",
  "First Product",
  "First Customer",
];
const UNCONFIRMED = "We couldn't confirm the save. Retry is safe.";
const FINISH_FAILED = "Couldn't finish setup. Retry.";
const SKIP_FAILED =
  "Couldn't save that you skipped setup. It will be offered again next time.";
const SAVE_CLAIMS = /pdf|receipt|invoice|чек|квитанц|рахун|сч[её]т/i;

const deferred = () => {
  let release;
  const promise = new Promise((resolveGate) => {
    release = resolveGate;
  });
  return { promise, release };
};

/**
 * A stateful mock of the endpoints the wizard writes to. `plan.products` /
 * `plan.recipients` hold one behaviour per create (consumed in order):
 * "error" answers 500, "lose" stores the entity then drops the response,
 * a promise holds the response until it resolves. `plan.complete` holds the
 * statuses for POST /settings/onboarding-complete.
 */
const installBackend = async (page, plan = {}) => {
  const log = [];
  let completed = false;
  const stored = { products: new Map(), recipients: new Map() };
  const entities = { products: [], recipients: [] };
  const queues = {
    products: [...(plan.products ?? [])],
    recipients: [...(plan.recipients ?? [])],
    complete: [...(plan.complete ?? [])],
  };

  await installApiMocks(page, createState());
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const method = request.method();
    const send = (body, status = 200, headers = {}) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/settings/onboarding-status") return send({ completed });
    if (path === "/settings/onboarding-complete" && method === "POST") {
      log.push({ method, path });
      const status = queues.complete.shift() ?? 200;
      completed = completed || status === 200;
      return status === 200
        ? send({ completed: true })
        : send({ error: "Internal server error", errorCode: "INTERNAL_SERVER_ERROR" }, status);
    }

    const [, collection, id] = path.split("/");
    if (collection !== "products" && collection !== "recipients") {
      return route.fallback();
    }
    if (method === "GET" && !id) return send(paginated(entities[collection]));
    if (method === "GET" && id) {
      const entity = entities[collection].find((row) => row.id === id);
      return entity ? send(entity) : send({}, 404);
    }

    const body = request.postDataJSON();
    const key = request.headers()["idempotency-key"];
    log.push({ method, path, key, body });

    if (method === "PATCH" && id) {
      const index = entities[collection].findIndex((row) => row.id === id);
      const { expectedQuantity, ...changes } = body;
      // The Stage 4 stock contract: nothing applies when stock moved.
      if (
        expectedQuantity !== undefined &&
        entities[collection][index].quantity !== expectedQuantity
      ) {
        return send(
          { error: "Stock changed", errorCode: "PRODUCT_QUANTITY_CONFLICT" },
          409,
        );
      }
      entities[collection][index] = { ...entities[collection][index], ...changes };
      return send(entities[collection][index]);
    }
    if (method !== "POST" || id) return route.fallback();

    const behaviour = queues[collection].shift();
    if (behaviour === "error") return send(DB_ERROR, 500);
    if (behaviour instanceof Promise) await behaviour;
    if (key && stored[collection].has(key)) {
      return send(stored[collection].get(key), 201, {
        "x-idempotency-replayed": "true",
      });
    }
    const entity = {
      ...body,
      id: `${collection}-${entities[collection].length + 1}`,
      created_at: "2026-10-29T10:00:00.000Z",
      updated_at: "2026-10-29T10:00:00.000Z",
    };
    entities[collection].push(entity);
    if (key) stored[collection].set(key, entity);
    // The server committed; only the answer is lost on the way back.
    if (behaviour === "lose") return route.abort("failed");
    return send(entity, 201);
  });

  const calls = (method, pathPrefix) =>
    log.filter((call) => call.method === method && call.path.startsWith(pathPrefix));
  return { log, entities, calls };
};

const heading = (page, step) =>
  page.getByRole("heading", { name: STEP_HEADINGS[step] });

const atStep = (page, step) =>
  heading(page, step)
    .waitFor()
    .then(() => true)
    .catch(() => false);

const button = (page, name) => page.getByRole("button", { name, exact: true });

const openAtProductStep = async (page) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await heading(page, 0).waitFor();
  await button(page, "Continue").click();
  await heading(page, 1).waitFor();
  await button(page, "Continue").click();
  await heading(page, 2).waitFor();
};

const fillProduct = async (page, name) => {
  await page.getByLabel("Product Name").fill(name);
  await page.getByLabel("Sale Price (UAH)").fill("26");
  await page.getByLabel("Quantity").fill("10");
};

const noticeText = (page) =>
  page
    .getByTestId("onboarding-notice")
    .innerText()
    .catch(() => "");

const revisitReusesEntities = async (results) => {
  await withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(5000);
    const backend = await installBackend(page, { complete: [500, 200] });
    await openAtProductStep(page);
    await fillProduct(page, "Arabica beans");
    await button(page, "Continue").click();
    await heading(page, 3).waitFor();

    await button(page, "Back").click();
    await heading(page, 2).waitFor();
    results.check(
      "revisit: going back shows the saved product's values",
      (await page.getByLabel("Product Name").inputValue()) === "Arabica beans",
    );
    await button(page, "Continue").click();
    const advancedUnchanged = await atStep(page, 3);
    results.check(
      "revisit: Back then Next without changes sends no request",
      advancedUnchanged &&
        backend.calls("POST", "/products").length === 1 &&
        backend.calls("PATCH", "/products").length === 0,
      JSON.stringify(backend.log),
    );

    await button(page, "Back").click();
    await page.getByLabel("Product Name").fill("Arabica beans 1kg");
    await button(page, "Continue").click();
    await heading(page, 3).waitFor();
    const patches = backend.calls("PATCH", "/products");
    results.check(
      "revisit: a renamed product is PATCHed with only its name, never re-created",
      backend.calls("POST", "/products").length === 1 &&
        patches.length === 1 &&
        patches[0].path === "/products/products-1" &&
        JSON.stringify(patches[0].body) === JSON.stringify({ name: "Arabica beans 1kg" }),
      JSON.stringify(backend.log),
    );
    results.check(
      "revisit: the first create carried an Idempotency-Key",
      typeof backend.calls("POST", "/products")[0]?.key === "string",
      JSON.stringify(backend.calls("POST", "/products")),
    );

    await page.getByLabel("Name", { exact: true }).fill("Olena Kovalenko");
    await page.getByLabel("Email").fill("olena@example.com");
    const finish = button(page, "Get started");
    const finishCopy = await finish.innerText();
    results.check(
      "finish: the button does not promise a PDF or a receipt",
      !SAVE_CLAIMS.test(finishCopy),
      finishCopy,
    );
    await finish.click();
    await waitFor(async () => (await noticeText(page)).includes(FINISH_FAILED), {
      label: "the completion failure notice",
    }).catch(() => undefined);
    results.check(
      "finish: a failed completion keeps the modal open and says so",
      (await heading(page, 3).isVisible()) &&
        (await noticeText(page)).includes(FINISH_FAILED) &&
        (await page.getByLabel("Name", { exact: true }).inputValue()) ===
          "Olena Kovalenko",
      await noticeText(page),
    );

    await page
      .getByTestId("onboarding-notice")
      .getByRole("button", { name: "Retry" })
      .click();
    const closed = await heading(page, 3)
      .waitFor({ state: "detached" })
      .then(() => true)
      .catch(() => false);
    results.check(
      "finish: Retry completes without creating the recipient again",
      closed &&
        backend.calls("POST", "/recipients").length === 1 &&
        backend.calls("PATCH", "/recipients").length === 0 &&
        backend.calls("POST", "/settings/onboarding-complete").length === 2,
      JSON.stringify(backend.log),
    );
    results.check(
      "finish: exactly one product and one recipient exist",
      backend.entities.products.length === 1 &&
        backend.entities.recipients.length === 1,
      JSON.stringify(backend.entities),
    );
  });
};

const saveIsSingleFlight = async (results) => {
  await withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(5000);
    const gate = deferred();
    const backend = await installBackend(page, { products: [gate.promise] });
    await openAtProductStep(page);
    await fillProduct(page, "Pour-over dripper");

    // Two clicks in one task: the second lands before React re-renders the
    // disabled button, so only an in-flight guard can stop it.
    await page.evaluate(() => {
      const next = [...document.querySelectorAll("button")].find(
        (element) => element.textContent.trim() === "Continue",
      );
      next.click();
      next.click();
    });
    await waitFor(() => backend.calls("POST", "/products").length >= 1, {
      label: "the product create",
    });

    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const skip = [...document.querySelectorAll("button")].find(
        (element) => element.textContent.trim() === "Skip for now",
      );
      skip.click();
    });
    await page.getByRole("button", { name: "Close" }).click();
    results.check(
      "in flight: Escape, Skip and Close neither close the modal nor complete onboarding",
      (await heading(page, 2).isVisible()) &&
        backend.calls("POST", "/settings/onboarding-complete").length === 0,
      JSON.stringify(backend.log),
    );
    results.check(
      "in flight: Skip and Back are disabled while saving",
      (await button(page, "Skip for now").isDisabled()) &&
        (await button(page, "Back").isDisabled()),
    );

    gate.release();
    const advanced = await atStep(page, 3);
    results.check(
      "in flight: a double click on Next sends one create",
      advanced && backend.calls("POST", "/products").length === 1,
      JSON.stringify(backend.log),
    );
  });
};

const failedSaveKeepsInput = async (results) => {
  await withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(5000);
    const backend = await installBackend(page, { products: ["error"] });
    await openAtProductStep(page);
    await fillProduct(page, "Arabica beans");
    await button(page, "Continue").click();
    await page.getByTestId("onboarding-notice").waitFor();

    const text = await noticeText(page);
    results.check(
      "500: the step and every typed value stay",
      (await heading(page, 2).isVisible()) &&
        (await page.getByLabel("Product Name").inputValue()) === "Arabica beans" &&
        (await page.getByLabel("Sale Price (UAH)").inputValue()) === "26" &&
        (await page.getByLabel("Quantity").inputValue()) === "10",
    );
    results.check(
      "500: a friendly message, without database text",
      text.includes("Internal server error") && !text.includes("duplicate key"),
      text,
    );

    await page.getByLabel("Product Name").fill("Arabica beans (new lot)");
    await button(page, "Continue").click();
    const advanced = await atStep(page, 3);
    const posts = backend.calls("POST", "/products");
    results.check(
      "500: the next attempt sends the corrected form and advances",
      advanced &&
        posts.length === 2 &&
        posts[1].body.name === "Arabica beans (new lot)" &&
        backend.entities.products.length === 1,
      JSON.stringify(posts),
    );
  });
};

const lostResponseRetriesSameKey = async (results) => {
  await withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(5000);
    const backend = await installBackend(page, { products: ["lose"] });
    await openAtProductStep(page);
    await fillProduct(page, "Moka pot");
    await button(page, "Continue").click();
    await waitFor(async () => (await noticeText(page)).includes(UNCONFIRMED), {
      label: "the unconfirmed-save notice",
    }).catch(() => undefined);
    results.check(
      "lost response: the save is reported as unconfirmed and the step stays",
      (await noticeText(page)).includes(UNCONFIRMED) &&
        (await heading(page, 2).isVisible()),
      await noticeText(page),
    );

    // Edited after the lost answer: the retry repeats the original request,
    // then PATCHes the difference onto the entity it turns out to have created.
    await page.getByLabel("Product Name").fill("Moka pot 6 cups");
    await page
      .getByTestId("onboarding-notice")
      .getByRole("button", { name: "Retry" })
      .click();
    const advanced = await atStep(page, 3);
    const [first, retry] = backend.calls("POST", "/products");
    const patches = backend.calls("PATCH", "/products");
    results.check(
      "lost response: Retry resends the same request with the same Idempotency-Key",
      advanced &&
        backend.calls("POST", "/products").length === 2 &&
        typeof first?.key === "string" &&
        retry?.key === first.key &&
        JSON.stringify(retry.body) === JSON.stringify(first.body),
      JSON.stringify(backend.calls("POST", "/products")),
    );
    results.check(
      "lost response: one product exists, renamed by a PATCH",
      backend.entities.products.length === 1 &&
        patches.length === 1 &&
        JSON.stringify(patches[0].body) === JSON.stringify({ name: "Moka pot 6 cups" }) &&
        backend.entities.products[0].name === "Moka pot 6 cups",
      JSON.stringify({ entities: backend.entities, patches }),
    );
  });
};

const stockConflictKeepsInput = async (results) => {
  await withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(5000);
    const backend = await installBackend(page);
    await openAtProductStep(page);
    await fillProduct(page, "Filter papers");
    await button(page, "Continue").click();
    await heading(page, 3).waitFor();

    // An order elsewhere took 2 of the 10 while the wizard was open.
    backend.entities.products[0] = { ...backend.entities.products[0], quantity: 8 };
    await button(page, "Back").click();
    await page.getByLabel("Quantity").fill("15");
    await button(page, "Continue").click();
    await page.getByTestId("onboarding-notice").waitFor();
    const text = await noticeText(page);
    const [first] = backend.calls("PATCH", "/products");
    results.check(
      "stock conflict: the PATCH carried the saved stock as expectedQuantity",
      first?.body?.quantity === 15 && first?.body?.expectedQuantity === 10,
      JSON.stringify(first),
    );
    results.check(
      "stock conflict: the step keeps 15 and names the server's 8",
      (await heading(page, 2).isVisible()) &&
        (await page.getByLabel("Quantity").inputValue()) === "15" &&
        /\b8\b/.test(text) &&
        /\b15\b/.test(text),
      text,
    );

    await button(page, "Continue").click();
    const advanced = await atStep(page, 3);
    const second = backend.calls("PATCH", "/products")[1];
    results.check(
      "stock conflict: saving again overwrites knowingly against 8, without a new create",
      advanced &&
        second?.body?.expectedQuantity === 8 &&
        backend.entities.products[0].quantity === 15 &&
        backend.calls("POST", "/products").length === 1,
      JSON.stringify(backend.log),
    );
  });
};

const failedSkipIsNotSuccess = async (results) => {
  await withPage({ viewport: VIEWPORT }, async (page) => {
    page.setDefaultTimeout(5000);
    const backend = await installBackend(page, { complete: [500] });
    await page.goto(`${BASE_URL}/dashboard`);
    await heading(page, 0).waitFor();
    await button(page, "Skip for now").click();
    const toastShown = await page
      .getByText(SKIP_FAILED)
      .waitFor()
      .then(() => true)
      .catch(() => false);
    const closed = await heading(page, 0)
      .waitFor({ state: "detached" })
      .then(() => true)
      .catch(() => false);
    results.check(
      "skip: a failed skip closes the wizard and says it will be offered again",
      toastShown &&
        closed &&
        backend.calls("POST", "/settings/onboarding-complete").length === 1,
      JSON.stringify(backend.log),
    );
  });
};

const finishCopyInEveryLocale = (results) => {
  const copies = ["en", "ru", "uk"].map((locale) => {
    const translation = JSON.parse(
      readFileSync(resolve(LOCALES_DIR, locale, "translation.json"), "utf8"),
    );
    return `${locale}: ${translation.onboarding.finish}`;
  });
  results.check(
    "finish copy: no locale promises a PDF or a receipt",
    copies.every((copy) => !SAVE_CLAIMS.test(copy.slice(4))),
    copies.join(" | "),
  );
};

// A scenario that throws is one failed check, and the remaining scenarios still run.
const scenario = async (results, name, body) => {
  try {
    await body(results);
  } catch (error) {
    results.fail(`${name}: ran to the end`, String(error?.message ?? error).split("\n")[0]);
  }
};

/** The Skip/Next footer must stay on screen however short the window is. */
const footerStaysVisible = async (results) => {
  for (const viewport of [
    { width: 1024, height: 600 },
    { width: 320, height: 568 },
  ]) {
    await withPage({ viewport }, async (page) => {
      page.setDefaultTimeout(5000);
      await installBackend(page);
      await page.goto(`${BASE_URL}/dashboard`);
      await heading(page, 0).waitFor();
      const box = await button(page, "Continue").boundingBox();
      results.check(
        `footer: Continue is inside a ${viewport.width}x${viewport.height} window`,
        Boolean(box) && box.y + box.height <= viewport.height && box.y >= 0,
        JSON.stringify(box),
      );
    });
  }
};

export const run = async () => {
  const results = new Results("onboarding");
  await footerStaysVisible(results);
  finishCopyInEveryLocale(results);
  await scenario(results, "revisit", revisitReusesEntities);
  await scenario(results, "in flight", saveIsSingleFlight);
  await scenario(results, "500", failedSaveKeepsInput);
  await scenario(results, "lost response", lostResponseRetriesSameKey);
  await scenario(results, "stock conflict", stockConflictKeepsInput);
  await scenario(results, "skip", failedSkipIsNotSuccess);
  return results;
};
