const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * Spreadsheet apps run a cell that starts with = + - @ as a formula, so a product named
 * `=HYPERLINK(...)` would execute when the export is opened. Prefixing an apostrophe
 * makes it plain text. Plain numbers (including negatives) are left alone.
 */
export function neutralizeSpreadsheetFormula(value: string): string {
  if (!FORMULA_TRIGGERS.test(value) || PLAIN_NUMBER.test(value)) return value;
  return `'${value}`;
}
