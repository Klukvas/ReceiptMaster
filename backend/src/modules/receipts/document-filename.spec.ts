import { DocumentType } from "./entities/receipt.entity";
import { documentFilename } from "./receipts.service";

describe("documentFilename", () => {
  it("keeps the waybill's historical name", () => {
    expect(
      documentFilename({
        document_type: DocumentType.WAYBILL,
        number: "2026-000001",
      }),
    ).toBe("receipt-2026-000001.pdf");
  });

  it("names the other types by type", () => {
    expect(
      documentFilename({
        document_type: DocumentType.INVOICE,
        number: "2026-000002",
      }),
    ).toBe("invoice-2026-000002.pdf");
    expect(
      documentFilename({
        document_type: DocumentType.ACT,
        number: "2026-000003",
      }),
    ).toBe("act-2026-000003.pdf");
    expect(
      documentFilename({
        document_type: DocumentType.QUOTE,
        number: "2026-000004",
      }),
    ).toBe("quote-2026-000004.pdf");
  });
});
