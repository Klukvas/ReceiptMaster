// Verbatim copy of backend/src/common/utils/ua-requisites.util.ts: the frontend
// Docker context (./frontend) cannot import from backend. Keep the two identical;
// e2e/requisites-parity.spec.mjs compares their behaviour.
export const TAX_ID_KINDS = ["edrpou", "rnokpp"] as const;

export type TaxIdKind = (typeof TAX_ID_KINDS)[number];

/** Longer input is rejected before normalisation so a huge string is never scanned. */
export const MAX_RAW_IBAN_LENGTH = 64;

const UA_IBAN_PATTERN = /^UA\d{27}$/;
const ASCII_LETTER_OFFSET = 55; // "A" (65) becomes 10

/** Strips every whitespace character (NBSP included) and upper-cases; non-strings pass through. */
export function normalizeIban(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length > MAX_RAW_IBAN_LENGTH) return raw;
  return raw.replace(/\s+/gu, "").toUpperCase();
}

/** ISO 13616 check: moved to the end, letters become numbers, the remainder mod 97 must be 1. */
export function isValidUaIban(value: unknown): boolean {
  if (typeof value !== "string" || !UA_IBAN_PATTERN.test(value)) return false;
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char)
      ? char
      : String(char.charCodeAt(0) - ASCII_LETTER_OFFSET);
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Length and digits only; the control digit is deliberately not checked. */
export function isValidEdrpou(value: unknown): boolean {
  return typeof value === "string" && /^\d{8}$/.test(value);
}

export function isValidRnokpp(value: unknown): boolean {
  return typeof value === "string" && /^\d{10}$/.test(value);
}

export function isValidTaxId(value: unknown, kind: TaxIdKind): boolean {
  return kind === "edrpou" ? isValidEdrpou(value) : isValidRnokpp(value);
}

/** 8 digits is a company code, 10 a person's tax number; anything else has no kind. */
export function inferTaxIdKind(value: unknown): TaxIdKind | null {
  if (isValidEdrpou(value)) return "edrpou";
  if (isValidRnokpp(value)) return "rnokpp";
  return null;
}

export function isTaxIdKind(value: unknown): value is TaxIdKind {
  return (TAX_ID_KINDS as readonly unknown[]).includes(value);
}

/** VAT payer number (ІПН): 10 digits for a sole proprietor, 12 for a legal entity. */
export function isValidVatId(value: unknown): boolean {
  return typeof value === "string" && /^(\d{10}|\d{12})$/.test(value);
}
