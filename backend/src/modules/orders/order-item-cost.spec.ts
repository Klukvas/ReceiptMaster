import { draftLineCost, snapshotCost } from "./order-item-cost";

describe("order line cost snapshot", () => {
  it.each([
    [1400, 1400],
    [0, 0],
    [-1, null],
    [Number.NaN, null],
    [12.5, null],
  ])("snapshotCost(%p) is %p", (cost, expected) => {
    expect(snapshotCost({ purchase_price_cents: cost })).toBe(expected);
  });

  it("keeps the frozen cost of an unchanged draft line, including an unknown one", () => {
    const current = { purchase_price_cents: 999 };
    expect(draftLineCost({ qty: 2, unit_cost_cents: 400 }, 2, current)).toBe(
      400,
    );
    expect(draftLineCost({ qty: 2, unit_cost_cents: null }, 2, current)).toBe(
      null,
    );
  });

  it("captures the current cost for a new line or a changed quantity", () => {
    const current = { purchase_price_cents: 999 };
    expect(draftLineCost(undefined, 2, current)).toBe(999);
    expect(draftLineCost({ qty: 2, unit_cost_cents: null }, 3, current)).toBe(
      999,
    );
  });
});
