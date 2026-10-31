// Deleting a recipient the API refuses: the 409 must reach the user as a
// readable message, and the recipient must stay in the list.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { RECIPIENTS } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const REFUSED_MESSAGE = /has orders, including deleted ones/;

export const run = async () => {
  const results = new Results("recipient delete conflict");

  await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
    page.setDefaultTimeout(5000);
    await installApiMocks(page, createState());
    await page.route(`**/api/v1/recipients/${RECIPIENTS[0].id}`, (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: `Recipient ${RECIPIENTS[0].id} cannot be deleted`,
              errorCode: "RECIPIENT_HAS_ORDERS",
            }),
          })
        : route.fallback(),
    );

    await page.goto(`${BASE_URL}/recipients`);
    await page.getByTitle("Actions").first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Delete" }).click();

    const shown = await page
      .getByText(REFUSED_MESSAGE)
      .waitFor()
      .then(() => true)
      .catch(() => false);
    results.check("the refusal is shown to the user", shown);

    const closed = await dialog
      .waitFor({ state: "detached" })
      .then(() => true)
      .catch(() => false);
    results.check("the confirmation closes after the refusal", closed);
    results.check(
      "the recipient stays in the list",
      (await page.getByText(RECIPIENTS[0].name).count()) > 0,
    );
  });

  return results;
};
