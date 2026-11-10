import { inferTaxIdKind, type TaxIdKind } from "./ua-requisites";

// Check digits are advisory: the stored value is free text and a failed check only produces a hint.

const EDRPOU_WEIGHTS = [1, 2, 3, 4, 5, 6, 7] as const;
// Codes in the (30 000 000, 60 000 000) range start the weights from 7.
const EDRPOU_SHIFTED_WEIGHTS = [7, 1, 2, 3, 4, 5, 6] as const;
const EDRPOU_RETRY_OFFSET = 2;
const EDRPOU_SHIFTED_RANGE = {
  exclusiveFrom: 30_000_000,
  exclusiveTo: 60_000_000,
} as const;
const RNOKPP_WEIGHTS = [-1, 5, 7, 9, 4, 6, 10, 5, 7] as const;
const MODULUS = 11;
const MAX_CHECK_DIGIT = 9;

const digitsOf = (value: string): number[] => Array.from(value, Number);

const weightedRemainder = (
  digits: number[],
  weights: readonly number[],
): number =>
  digits.reduce((sum, digit, index) => sum + digit * weights[index], 0) %
  MODULUS;

/** The check digit of the first seven digits of an ЄДРПОУ, per the official two-pass algorithm. */
export function edrpouCheckDigit(
  firstSevenDigits: string,
  wholeCode: string,
): number {
  const digits = digitsOf(firstSevenDigits);
  const code = Number(wholeCode);
  const isShifted =
    code > EDRPOU_SHIFTED_RANGE.exclusiveFrom &&
    code < EDRPOU_SHIFTED_RANGE.exclusiveTo;
  const weights = isShifted ? EDRPOU_SHIFTED_WEIGHTS : EDRPOU_WEIGHTS;
  const first = weightedRemainder(digits, weights);
  if (first <= MAX_CHECK_DIGIT) return first;
  // A remainder of 10 repeats the sum with every weight raised by two (3..9 for the usual range).
  const retried = weightedRemainder(
    digits,
    weights.map((weight) => weight + EDRPOU_RETRY_OFFSET),
  );
  return retried > MAX_CHECK_DIGIT ? 0 : retried;
}

export function hasValidEdrpouChecksum(value: string): boolean {
  return (
    /^\d{8}$/.test(value) &&
    edrpouCheckDigit(value.slice(0, 7), value) === Number(value[7])
  );
}

export function hasValidRnokppChecksum(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const remainder = weightedRemainder(
    digitsOf(value.slice(0, 9)),
    RNOKPP_WEIGHTS,
  );
  // JS keeps the sign of a negative dividend, so fold it back into 0..10 first.
  const normalized = (remainder + MODULUS) % MODULUS;
  return normalized % 10 === Number(value[9]);
}

/**
 * Whether the code's check digit matches. `null` means there is nothing to judge: the value is
 * not 8 or 10 digits (the format check owns that) or the picked kind does not fit its length.
 */
export function taxIdChecksumStatus(
  rawValue: string,
  pickedKind: TaxIdKind | "" = "",
): boolean | null {
  const value = rawValue.trim();
  const kind = inferTaxIdKind(value);
  if (kind === null || (pickedKind !== "" && pickedKind !== kind)) return null;
  return kind === "edrpou"
    ? hasValidEdrpouChecksum(value)
    : hasValidRnokppChecksum(value);
}
