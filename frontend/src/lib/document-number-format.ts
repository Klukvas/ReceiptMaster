/**
 * Client mirror of the backend document number format, used only for the live preview while
 * a numbering row is edited. The authoritative next number is `NumberingSetting.nextNumber`.
 * Format: prefix + separator + (includeYear ? "YYYY-" : "") + value zero-padded to `padding`.
 * The separator is "-" when the trimmed prefix ends in a letter or digit ("КП" prints
 * "КП-2026-000001"); a prefix ending in a separator ("РФ-", "A.") is used as typed.
 */
export const PREFIX_MAX_LENGTH = 16;
export const PADDING_MIN = 1;
export const PADDING_MAX = 9;
export const START_NUMBER_MAX = 2_000_000_000;

// Letters, digits and . _ space - only; so no / \ " or control characters.
const PREFIX_PATTERN = /^[\p{L}\p{N}._ -]{0,16}$/u;

export type PrefixProblem = "invalid" | "endsWithDigit";

/** Why a prefix would be refused by the server, or null when it is acceptable. */
export function prefixProblem(prefix: string): PrefixProblem | null {
  const trimmed = prefix.trim();
  if (!PREFIX_PATTERN.test(trimmed)) return "invalid";
  // A trailing digit would run into the year or the counter and make numbers ambiguous.
  if (/\p{N}$/u.test(trimmed)) return "endsWithDigit";
  return null;
}

const RUNS_INTO_NUMBER = /[\p{L}\p{N}]$/u;
const PREFIX_SEPARATOR = "-";

export type NumberFormatParts = {
  prefix: string;
  padding: number;
  includeYear: boolean;
};

export function formatDocumentNumber(
  { prefix, padding, includeYear }: NumberFormatParts,
  value: number,
  year: number = new Date().getUTCFullYear(),
): string {
  const trimmed = prefix.trim();
  const separator = RUNS_INTO_NUMBER.test(trimmed) ? PREFIX_SEPARATOR : "";
  const yearPart = includeYear ? `${year}-` : "";
  return `${trimmed}${separator}${yearPart}${String(value).padStart(padding, "0")}`;
}

/** A whole number within the server's accepted start range, else null. */
export function parseStartNumber(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= 1 && value <= START_NUMBER_MAX ? value : null;
}
