export type VatMode = "none" | "included" | "added";

export interface VatSettings {
  readonly mode: VatMode;
  // Percent, at most two decimals (e.g. 20 or 7.5).
  readonly rate: number;
}

export interface VatBreakdown {
  readonly net: number;
  readonly vat: number;
  readonly gross: number;
}

const BASIS_POINTS_PER_PERCENT = 100;
const FULL_BASIS_POINTS = 10_000;

// round-half-up(amount * numerator / denominator) without the intermediate
// product, which would leave the safe-integer range for large amounts.
function scaleHalfUp(
  amount: number,
  numerator: number,
  denominator: number,
): number {
  const whole = Math.floor(amount / denominator);
  const remainder = amount % denominator;
  return (
    whole * numerator +
    Math.floor((2 * remainder * numerator + denominator) / (2 * denominator))
  );
}

function toBasisPoints(rate: number): number {
  const basisPoints = rate * BASIS_POINTS_PER_PERCENT;
  if (
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100 ||
    Math.abs(basisPoints - Math.round(basisPoints)) > 1e-9
  )
    throw new RangeError("VAT rate must be 0-100 with at most two decimals");
  return Math.round(basisPoints);
}

export function calculateVatBreakdown(
  amountCents: number,
  settings: VatSettings,
): VatBreakdown {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0)
    throw new RangeError("VAT amount must be a non-negative integer of cents");
  const basisPoints = toBasisPoints(settings.rate);
  if (settings.mode === "none")
    return { net: amountCents, vat: 0, gross: amountCents };
  if (settings.mode === "added") {
    const vat = scaleHalfUp(amountCents, basisPoints, FULL_BASIS_POINTS);
    const gross = amountCents + vat;
    if (!Number.isSafeInteger(gross))
      throw new RangeError("VAT gross amount is too large");
    return { net: amountCents, vat, gross };
  }
  if (settings.mode !== "included") throw new RangeError("Unknown VAT mode");
  const vat = scaleHalfUp(
    amountCents,
    basisPoints,
    FULL_BASIS_POINTS + basisPoints,
  );
  return { net: amountCents - vat, vat, gross: amountCents };
}
