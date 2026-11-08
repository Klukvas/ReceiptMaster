import { pickSortColumn } from "./sort-column.util";

const allowed = { created_at: "r.created_at", name: "r.name" };

describe("pickSortColumn", () => {
  it("returns the mapped column for an allowed key", () => {
    expect(pickSortColumn(allowed, "name", "r.created_at")).toBe("r.name");
  });

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
    "unknown",
    "",
    undefined,
    null,
    42,
    ["name"],
  ])("falls back for %p", (sortBy) => {
    expect(pickSortColumn(allowed, sortBy, "fallback")).toBe("fallback");
  });

  it("does not touch Object.prototype", () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    pickSortColumn(allowed, "__proto__", "x");
    pickSortColumn(allowed, "constructor", "x");
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
