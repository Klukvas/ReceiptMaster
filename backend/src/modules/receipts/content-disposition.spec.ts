import { IncomingMessage, ServerResponse } from "http";
import { pdfDisposition } from "./content-disposition";

describe("pdfDisposition", () => {
  it("keeps an ASCII name as it was and adds the extended form", () => {
    expect(pdfDisposition("receipt-2026-000001.pdf")).toBe(
      "inline; filename=\"receipt-2026-000001.pdf\"; filename*=UTF-8''receipt-2026-000001.pdf",
    );
  });

  it("falls back to ASCII for a Cyrillic prefix and carries the real name in filename*", () => {
    const header = pdfDisposition("invoice-РФ-2026-000043.pdf");

    expect(header).toContain('filename="invoice-__-2026-000043.pdf"');
    expect(header).toContain(
      `filename*=UTF-8''invoice-${encodeURIComponent("РФ")}-2026-000043.pdf`,
    );
    // Node throws on a header value outside Latin-1; this one is plain ASCII.
    expect(/^[\x20-\x7e]+$/.test(header)).toBe(true);
  });

  it("cannot break out of the quoted name", () => {
    const header = pdfDisposition('a"b\\c%d\r\ne.pdf');
    expect(header).toContain('filename="a_b_c_d__e.pdf"');
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("percent-encodes the characters RFC 5987 reserves", () => {
    expect(pdfDisposition("a'(b)*.pdf")).toContain(
      "filename*=UTF-8''a%27%28b%29%2A.pdf",
    );
  });

  it("can be set as a real response header", () => {
    const response = new ServerResponse(new IncomingMessage(undefined));
    expect(() =>
      response.setHeader("Content-Disposition", pdfDisposition("акт-№1.pdf")),
    ).not.toThrow();
  });
});
