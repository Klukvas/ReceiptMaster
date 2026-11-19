import { PLAN_LIMITS } from "../../subscription/config/plans.config";
import { planBranding, withAttribution } from "./attribution";

describe("document attribution line", () => {
  const page = "<html><body><div class='container'>doc</div></body></html>";

  it("goes last in the body, after the template's own content", () => {
    const html = withAttribution(page, "en");

    expect(html).toMatch(
      /doc<\/div><div class="rm-attribution"[^>]*>Made with ReceiptMaster · receiptmaster\.org<\/div><\/body><\/html>$/,
    );
  });

  it.each([
    ["uk", "Створено в ReceiptMaster"],
    ["ru", "Создано в ReceiptMaster"],
    ["de", "Made with ReceiptMaster"],
  ])("uses the document language (%s)", (language, text) => {
    expect(withAttribution(page, language)).toContain(text);
  });

  it("is appended when the markup has no closing body tag", () => {
    expect(withAttribution("<p>doc</p>", "en")).toMatch(
      /^<p>doc<\/p><div class="rm-attribution"/,
    );
  });

  it("uses only the last closing body tag", () => {
    const html = withAttribution("<pre></body></pre><p>x</p></body>", "en");

    expect(html.indexOf("rm-attribution")).toBeGreaterThan(
      html.indexOf("<p>x"),
    );
  });
});

describe("plan branding", () => {
  it("free: no logo, no signature, with the service line", () => {
    expect(planBranding(PLAN_LIMITS.free)).toEqual({
      allowsLogo: false,
      allowsSignoff: false,
      hasAttribution: true,
    });
  });

  it.each(["pro", "business"] as const)(
    "%s: own branding and no service line",
    (plan) => {
      expect(planBranding(PLAN_LIMITS[plan])).toEqual({
        allowsLogo: true,
        allowsSignoff: true,
        hasAttribution: false,
      });
    },
  );
});
