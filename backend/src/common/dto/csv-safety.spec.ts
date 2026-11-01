import { neutralizeSpreadsheetFormula } from "../../../../frontend/src/lib/csv-safety";

describe("neutralizeSpreadsheetFormula", () => {
  it.each([
    '=HYPERLINK("http://evil","x")',
    "+1+1",
    "-cmd|' /C calc'!A0",
    "@SUM(A1)",
    "\tTabbed",
  ])("turns %s into plain text", (value) => {
    expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
  });

  it.each(["Apple", "12.50", "-12.50", "0", "", "a=b"])(
    "leaves %s alone",
    (value) => {
      expect(neutralizeSpreadsheetFormula(value)).toBe(value);
    },
  );
});
