import { readFileSync } from "fs";
import { join } from "path";
import { DOCUMENT_LABELS } from "./document-labels";

// The proforma and the commercial proposal print the same caption over the same field.
const proformaCaption = (language: string): string =>
  JSON.parse(readFileSync(join(__dirname, `${language}.json`), "utf8"))
    .deliveryTerms;

describe("delivery terms caption", () => {
  it.each(["uk", "ru", "en"] as const)(
    "is the same on the proforma and the proposal (%s)",
    (language) => {
      expect(proformaCaption(language)).toBe(
        DOCUMENT_LABELS[language].deliveryTerms,
      );
    },
  );
});
