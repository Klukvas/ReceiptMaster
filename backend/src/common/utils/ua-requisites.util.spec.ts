import {
  inferTaxIdKind,
  isTaxIdKind,
  isValidEdrpou,
  isValidRnokpp,
  isValidUaIban,
  isValidVatId,
  normalizeIban,
} from "./ua-requisites.util";

const REAL_IBAN = "UA213223130000026007233566001";

describe("normalizeIban", () => {
  it("strips regular and non-breaking whitespace and upper-cases", () => {
    expect(normalizeIban(" ua21 3223 130000026007233566001\t")).toBe(REAL_IBAN);
  });

  it("leaves non-strings and over-long input untouched", () => {
    expect(normalizeIban(null)).toBeNull();
    expect(normalizeIban(42)).toBe(42);
    const long = "u".repeat(65);
    expect(normalizeIban(long)).toBe(long);
  });
});

describe("isValidUaIban", () => {
  it("accepts a real IBAN", () => {
    expect(isValidUaIban(REAL_IBAN)).toBe(true);
  });

  it("rejects a corrupted checksum", () => {
    expect(isValidUaIban("UA223223130000026007233566001")).toBe(false);
    expect(isValidUaIban("UA213223130000026007233566002")).toBe(false);
  });

  it("rejects non-UA, wrong length, lower case and spaced input", () => {
    expect(isValidUaIban("DE89370400440532013000")).toBe(false);
    expect(isValidUaIban(REAL_IBAN.slice(0, -1))).toBe(false);
    expect(isValidUaIban(`${REAL_IBAN}0`)).toBe(false);
    expect(isValidUaIban(REAL_IBAN.toLowerCase())).toBe(false);
    expect(isValidUaIban("UA21 3223130000026007233566001")).toBe(false);
    expect(isValidUaIban(undefined)).toBe(false);
  });
});

describe("tax ids", () => {
  it("accepts exactly 8 digits as ЄДРПОУ and 10 as РНОКПП", () => {
    expect(isValidEdrpou("12345678")).toBe(true);
    expect(isValidEdrpou("1234567")).toBe(false);
    expect(isValidEdrpou("1234567a")).toBe(false);
    expect(isValidRnokpp("1234567890")).toBe(true);
    expect(isValidRnokpp("123456789")).toBe(false);
    expect(isValidRnokpp("12345678901")).toBe(false);
  });

  it("infers the kind from the length", () => {
    expect(inferTaxIdKind("12345678")).toBe("edrpou");
    expect(inferTaxIdKind("1234567890")).toBe("rnokpp");
    expect(inferTaxIdKind("123456789")).toBeNull();
    expect(inferTaxIdKind("abcdefgh")).toBeNull();
    expect(inferTaxIdKind(null)).toBeNull();
  });

  it("recognises the kinds and the VAT id lengths", () => {
    expect(isTaxIdKind("edrpou")).toBe(true);
    expect(isTaxIdKind("other")).toBe(false);
    expect(isValidVatId("1234567890")).toBe(true);
    expect(isValidVatId("123456789012")).toBe(true);
    expect(isValidVatId("12345678901")).toBe(false);
    expect(isValidVatId("12345678901a")).toBe(false);
  });
});
