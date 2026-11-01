import { containsPattern } from "./like-pattern.util";

describe("containsPattern", () => {
  it("wraps plain text for a contains search and trims it", () => {
    expect(containsPattern("  apple ")).toBe("%apple%");
  });

  it.each([
    ["%", "%\\%%"],
    ["_", "%\\_%"],
    ["50%_off", "%50\\%\\_off%"],
    ["a\\b", "%a\\\\b%"],
  ])("escapes LIKE wildcards in %s", (input, expected) => {
    expect(containsPattern(input)).toBe(expected);
  });
});
