import { calculateVatBreakdown } from "./vat.util";

// Reference round-half-up(amount * numerator / denominator) in exact integers.
function exactHalfUp(amount: number, numerator: number, denominator: number) {
  const product = BigInt(amount) * BigInt(numerator);
  const denom = BigInt(denominator);
  return (BigInt(2) * product + denom) / (BigInt(2) * denom);
}

describe("calculateVatBreakdown", () => {
  describe("mode none", () => {
    it("returns the amount untouched with zero VAT", () => {
      expect(calculateVatBreakdown(12345, { mode: "none", rate: 20 })).toEqual({
        net: 12345,
        vat: 0,
        gross: 12345,
      });
    });
  });

  describe("mode added", () => {
    it.each([
      [10000, 20, { net: 10000, vat: 2000, gross: 12000 }],
      [25, 10, { net: 25, vat: 3, gross: 28 }], // 2.5 -> 3
      [24, 10, { net: 24, vat: 2, gross: 26 }], // 2.4 -> 2
      [26, 10, { net: 26, vat: 3, gross: 29 }], // 2.6 -> 3
      [35, 10, { net: 35, vat: 4, gross: 39 }], // 3.5 -> 4
      [0, 20, { net: 0, vat: 0, gross: 0 }],
      [1, 20, { net: 1, vat: 0, gross: 1 }], // 0.2 -> 0
      [3, 20, { net: 3, vat: 1, gross: 4 }], // 0.6 -> 1
      [5, 10, { net: 5, vat: 1, gross: 6 }], // 0.5 -> 1
      [10000, 0, { net: 10000, vat: 0, gross: 10000 }],
      [10000, 100, { net: 10000, vat: 10000, gross: 20000 }],
      [10000, 7.5, { net: 10000, vat: 750, gross: 10750 }],
      [10000, 7.55, { net: 10000, vat: 755, gross: 10755 }],
    ])("%i cents at %d%%", (amount, rate, expected) => {
      expect(calculateVatBreakdown(amount, { mode: "added", rate })).toEqual(
        expected,
      );
    });
  });

  describe("mode included", () => {
    it.each([
      [12000, 20, { net: 10000, vat: 2000, gross: 12000 }],
      [1000, 7, { net: 935, vat: 65, gross: 1000 }], // 65.42 -> 65
      [0, 20, { net: 0, vat: 0, gross: 0 }],
      [10000, 0, { net: 10000, vat: 0, gross: 10000 }],
      [10000, 100, { net: 5000, vat: 5000, gross: 10000 }],
      [10750, 7.5, { net: 10000, vat: 750, gross: 10750 }],
      [11, 10, { net: 10, vat: 1, gross: 11 }], // 1.0
      [21, 10, { net: 19, vat: 2, gross: 21 }], // 1.909 -> 2
      [1, 100, { net: 0, vat: 1, gross: 1 }], // 0.5 -> 1
      [3, 100, { net: 1, vat: 2, gross: 3 }], // 1.5 -> 2
    ])("%i cents at %d%%", (amount, rate, expected) => {
      expect(calculateVatBreakdown(amount, { mode: "included", rate })).toEqual(
        expected,
      );
    });

    it("always keeps net + vat === gross", () => {
      for (let amount = 0; amount < 400; amount += 1) {
        for (const rate of [5, 7, 7.5, 20, 23, 99.99]) {
          const result = calculateVatBreakdown(amount, {
            mode: "included",
            rate,
          });
          expect(result.net + result.vat).toBe(result.gross);
          expect(result.gross).toBe(amount);
          expect(result.net).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe("large amounts", () => {
    const nearLimit = 9_000_000_000_000_001;

    it("included: matches exact BigInt arithmetic near 9e15", () => {
      const result = calculateVatBreakdown(nearLimit, {
        mode: "included",
        rate: 20,
      });
      const expectedVat = exactHalfUp(nearLimit, 2000, 12000);
      expect(BigInt(result.vat)).toBe(expectedVat);
      expect(BigInt(result.net)).toBe(BigInt(nearLimit) - expectedVat);
      expect(BigInt(result.net) + BigInt(result.vat)).toBe(
        BigInt(result.gross),
      );
      expect(result.gross).toBe(nearLimit);
    });

    it("added: VAT matches exact BigInt arithmetic near 9e15", () => {
      const amount = 7_000_000_000_000_001;
      const result = calculateVatBreakdown(amount, {
        mode: "added",
        rate: 7.5,
      });
      expect(BigInt(result.vat)).toBe(exactHalfUp(amount, 750, 10000));
      expect(result.net).toBe(amount);
      expect(BigInt(result.net) + BigInt(result.vat)).toBe(
        BigInt(result.gross),
      );
      expect(Number.isSafeInteger(result.gross)).toBe(true);
    });

    // gross = 9e15 * 1.2 = 1.08e16 > Number.MAX_SAFE_INTEGER: the sum silently
    // loses precision instead of throwing.
    it("added: never returns an inexact gross (exact or RangeError)", () => {
      let result;
      try {
        result = calculateVatBreakdown(nearLimit, { mode: "added", rate: 20 });
      } catch (error) {
        expect(error).toBeInstanceOf(RangeError);
        return;
      }
      expect(Number.isSafeInteger(result.gross)).toBe(true);
      expect(BigInt(result.net) + BigInt(result.vat)).toBe(
        BigInt(result.gross),
      );
    });

    it("Number.MAX_SAFE_INTEGER in mode none is returned as is", () => {
      expect(
        calculateVatBreakdown(Number.MAX_SAFE_INTEGER, {
          mode: "none",
          rate: 0,
        }),
      ).toEqual({
        net: Number.MAX_SAFE_INTEGER,
        vat: 0,
        gross: Number.MAX_SAFE_INTEGER,
      });
    });
  });

  describe("invalid input", () => {
    it.each([7.555, -1, 101, Number.NaN, Infinity, -0.01, 100.01])(
      "rejects rate %d",
      (rate) => {
        expect(() =>
          calculateVatBreakdown(1000, { mode: "added", rate }),
        ).toThrow(RangeError);
      },
    );

    it.each([-1, 0.5, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      "rejects amount %d",
      (amount) => {
        expect(() =>
          calculateVatBreakdown(amount, { mode: "included", rate: 20 }),
        ).toThrow(RangeError);
      },
    );

    it("rejects invalid amount even in mode none", () => {
      expect(() =>
        calculateVatBreakdown(-5, { mode: "none", rate: 0 }),
      ).toThrow(RangeError);
    });

    it("rejects missing rate", () => {
      expect(() =>
        calculateVatBreakdown(100, { mode: "added" } as never),
      ).toThrow(RangeError);
    });
  });

  it("does not mutate the settings object", () => {
    const settings = Object.freeze({ mode: "added" as const, rate: 20 });
    expect(() => calculateVatBreakdown(1000, settings)).not.toThrow();
  });
});
