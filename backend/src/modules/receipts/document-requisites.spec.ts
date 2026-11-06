import {
  buildBuyer,
  buildSeller,
  buyerFingerprint,
  evaluateRequisites,
} from "./document-requisites";
import { DocumentType } from "./entities/receipt.entity";
import type { DocumentConfig } from "../settings/document-config";

const VALID_IBAN = "UA213223130000026007233566001";

const company = (over: Record<string, string> = {}) =>
  ({
    companyName: "ТОВ Продавець",
    companyAddress: "Київ",
    companyEmail: "",
    companyPhone: "",
    companyTaxId: "12345678",
    companyIban: VALID_IBAN,
    companySwift: "",
    companyWebsite: "",
    companyTagline: "",
    ...over,
  }) as DocumentConfig["company"];

const buyer = buildBuyer({ name: "Іван" });

describe("buildSeller", () => {
  it("normalises the IBAN and infers the tax id kind", () => {
    const seller = buildSeller(
      company({ companyIban: " ua21 3223 1300 0002 6007 2335 6600 1 " }),
      {},
    );
    expect(seller.iban).toBe(VALID_IBAN);
    expect(seller.taxIdKind).toBe("edrpou");
  });
  it("prefers the stored kind when it fits the number", () => {
    const seller = buildSeller(company({ companyTaxId: "1234567890" }), {
      companyTaxIdKind: "rnokpp",
    });
    expect(seller.taxIdKind).toBe("rnokpp");
  });
  it("ignores a stored kind that contradicts the number", () => {
    const seller = buildSeller(company({ companyTaxId: "12345678" }), {
      companyTaxIdKind: "rnokpp",
    });
    expect(seller.taxIdKind).toBe("edrpou");
  });
});

describe("evaluateRequisites: invoice", () => {
  const check = (seller: ReturnType<typeof buildSeller>) =>
    evaluateRequisites(DocumentType.INVOICE, seller, buyer, {});

  it("passes with name, tax id and IBAN, warning about the soft fields", () => {
    const result = check(buildSeller(company(), {}));
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([
      "seller.bankName",
      "seller.legalForm",
      "seller.vatPayer",
      "buyer.taxId",
    ]);
  });
  it("requires an IBAN that passes the checksum", () => {
    expect(
      check(buildSeller(company({ companyIban: "" }), {})).missing,
    ).toEqual(["seller.iban"]);
    expect(
      check(
        buildSeller(
          company({ companyIban: "UA213223130000026007233566002" }),
          {},
        ),
      ).missing,
    ).toEqual(["seller.iban"]);
  });
  it("treats a tax id of unknown kind as absent", () => {
    expect(
      check(buildSeller(company({ companyTaxId: "123" }), {})).missing,
    ).toEqual(["seller.taxId"]);
  });
  it("requires the VAT number from a VAT payer only", () => {
    const payer = buildSeller(company(), { companyVatPayer: true });
    expect(check(payer).missing).toEqual(["seller.vatId"]);
    const withId = buildSeller(company(), {
      companyVatPayer: true,
      companyVatId: "123456789012",
    });
    expect(check(withId).missing).toEqual([]);
    const nonPayer = buildSeller(company(), { companyVatPayer: false });
    expect(check(nonPayer).missing).toEqual([]);
    expect(check(nonPayer).warnings).not.toContain("seller.vatPayer");
  });
  it("lists every missing field at once", () => {
    expect(
      check(
        buildSeller(
          company({ companyName: "", companyTaxId: "", companyIban: "" }),
          {},
        ),
      ).missing,
    ).toEqual(["seller.name", "seller.taxId", "seller.iban"]);
  });
  it("does not warn about a buyer tax id the buyer has", () => {
    const full = buildBuyer({ name: "X", tax_id: "87654321" });
    const result = evaluateRequisites(
      DocumentType.INVOICE,
      buildSeller(company(), {}),
      full,
      {},
    );
    expect(result.warnings).not.toContain("buyer.taxId");
  });
});

describe("evaluateRequisites: act", () => {
  const signed = buildSeller(company({ companyIban: "" }), {
    companySignatoryName: "Петренко П.П.",
    companySignatoryPosition: "Директор",
  });
  it("does not need an IBAN but needs the signatory", () => {
    expect(
      evaluateRequisites(DocumentType.ACT, signed, buyer, {}).missing,
    ).toEqual([]);
    const unsigned = buildSeller(company(), {});
    expect(
      evaluateRequisites(DocumentType.ACT, unsigned, buyer, {}).missing,
    ).toEqual(["seller.signatoryName", "seller.signatoryPosition"]);
  });
  it("warns about the buyer and the contract, and stops when given", () => {
    expect(
      evaluateRequisites(DocumentType.ACT, signed, buyer, {}).warnings,
    ).toEqual(["buyer.legalName", "buyer.taxId", "details.contractRef"]);
    const known = buildBuyer({
      name: "X",
      legal_name: "ТОВ Х",
      tax_id: "87654321",
    });
    expect(
      evaluateRequisites(DocumentType.ACT, signed, known, { contractRef: "№1" })
        .warnings,
    ).toEqual([]);
  });
});

describe("evaluateRequisites: sales receipt", () => {
  const check = (seller: ReturnType<typeof buildSeller>) =>
    evaluateRequisites(DocumentType.SALES_RECEIPT, seller, buyer, {});

  it("needs only the seller's name, and warns about tax id and VAT status", () => {
    const bare = check(buildSeller(company({ companyTaxId: "" }), {}));
    expect(bare.missing).toEqual([]);
    expect(bare.warnings).toEqual(["seller.taxId", "seller.vatPayer"]);
    expect(check(buildSeller(company(), { companyVatPayer: false }))).toEqual({
      missing: [],
      warnings: [],
    });
  });

  it("refuses a seller without a name", () => {
    expect(
      check(buildSeller(company({ companyName: "" }), {})).missing,
    ).toEqual(["seller.name"]);
  });

  it("requires the VAT number from a VAT payer", () => {
    expect(
      check(buildSeller(company(), { companyVatPayer: true })).missing,
    ).toEqual(["seller.vatId"]);
  });
});

describe("evaluateRequisites: packing list", () => {
  const check = (seller: ReturnType<typeof buildSeller>) =>
    evaluateRequisites(DocumentType.PACKING_LIST, seller, buyer, {});

  it("needs only the seller's name and never warns", () => {
    expect(
      check(
        buildSeller(company({ companyTaxId: "", companyIban: "" }), {
          companyVatPayer: true,
        }),
      ),
    ).toEqual({ missing: [], warnings: [] });
    expect(
      check(buildSeller(company({ companyName: "" }), {})).missing,
    ).toEqual(["seller.name"]);
  });
});

describe("evaluateRequisites: quote", () => {
  const check = (seller: ReturnType<typeof buildSeller>) =>
    evaluateRequisites(DocumentType.QUOTE, seller, buyer, {});

  it("needs only the seller's name, and warns about tax id, legal form and VAT status", () => {
    const bare = check(buildSeller(company({ companyTaxId: "" }), {}));
    expect(bare.missing).toEqual([]);
    expect(bare.warnings).toEqual([
      "seller.taxId",
      "seller.legalForm",
      "seller.vatPayer",
    ]);
    expect(
      check(
        buildSeller(company(), {
          companyLegalForm: "ТОВ",
          companyVatPayer: false,
        }),
      ),
    ).toEqual({ missing: [], warnings: [] });
  });

  it("does not need an IBAN", () => {
    expect(
      check(buildSeller(company({ companyIban: "" }), {})).missing,
    ).toEqual([]);
  });

  it("refuses a seller without a name", () => {
    expect(
      check(buildSeller(company({ companyName: "" }), {})).missing,
    ).toEqual(["seller.name"]);
  });

  it("requires the VAT number from a VAT payer", () => {
    expect(
      check(buildSeller(company(), { companyVatPayer: true })).missing,
    ).toEqual(["seller.vatId"]);
  });
});

describe("buyerFingerprint", () => {
  it("changes with the buyer's IBAN and ignores the display name", () => {
    const base = buildBuyer({ name: "A", iban: VALID_IBAN });
    expect(buyerFingerprint(base)).toBe(
      buyerFingerprint(buildBuyer({ name: "B", iban: VALID_IBAN })),
    );
    expect(buyerFingerprint(base)).not.toBe(
      buyerFingerprint(
        buildBuyer({ name: "A", iban: "UA000000000000000000000000000" }),
      ),
    );
  });
});
