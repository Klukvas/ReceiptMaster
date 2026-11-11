import { createHash } from "crypto";
import { TemplateService, ReceiptTemplate } from "./template.service";
import { Order } from "../../orders/entities/order.entity";
import { OrderItem } from "../../orders/entities/order-item.entity";
import { Recipient } from "../../recipients/entities/recipient.entity";

/**
 * Digests of the HTML each style produced before document requisites existed.
 * A waybill passes no `document`, so adding the requisites partial must not change
 * a single byte of its output. Deliberate changes since: the waybill's number, date and
 * total labels no longer say "invoice" (classic, vintage, corporate, thermal, dark, branded,
 * delivery and proforma), and the regular font is embedded unescaped, so its data URL is valid
 * (every style).
 */
const GOLDEN_SHA256: Record<string, string> = {
  standard: "1a3758e150229eee811fa4e3b74393e25f3567d91c2fa8d25f096b7594aa987a",
  compact: "b3ba8b861491205d5d5930715348bdca4698b6c34964298656341d39a59a2e97",
  classic: "9933d403fefd6705293880b8d9a7b72879b92726fded35fcc26491e09287677b",
  modern: "3f86ee6ea6c41267b23e1f03529e9fcc164e50a2705d9e0a47b08205264eb1ec",
  elegant: "ff211925d81ec752b726d66c4500eda899bf2177fbd7b29820c2960d38622f50",
  vintage: "c18fa5afa332dc65a63b83209ebf26ec787eec905d88ef4cbab07c3103d868a6",
  tech: "3bb8b1e252e259ec17081cf97d8782be0e9fc2fa16b2264639f1b3fab3ee5530",
  wave: "164f5deccb7d542bec48c122ff5396a588e1e5c254c33ce26fb3bb21512e2b7f",
  minimal: "4344b1d86d9676ca0c7d833119a7c6149916227bfa1ab61899dd3ffe42d67911",
  corporate: "5bc117d4ce656187dc59e8bdfbd100cfc46c86d7ce938e837994de120761ee8f",
  thermal: "8c3d4a8884678cddc0fb1c271ac4d4e9e89f3ecbc9d0a83ff4a0da278fcd343b",
  dark: "99c660b1f0b242e1a002b7a6f64080f433ba52ccf15e2e62215cb2568f0e24d2",
  branded: "4fd0e5d2ae488b715945ccf1b0134b58f409a42178d704bf42cc45f391095e45",
  delivery: "d15c68dcbf47e27e791b305b06a00707deffa0ad584c63b6487395f9b2b7a3c8",
  proforma: "feaf8ea3920f8f76e9ccfc17a0d2363b8f7e023ee4c3970f23eff3725e5ed703",
};

const order = Object.assign(new Order(), {
  currency: "UAH",
  created_at: new Date("2026-10-14T12:34:00Z"),
  subtotal_cents: 150000,
  total_cents: 150000,
  recipient: Object.assign(new Recipient(), {
    name: "Recipient",
    email: "r@example.com",
    phone: "+380501234567",
    address: "Kyiv",
  }),
  items: [
    Object.assign(new OrderItem(), {
      product_name: "Product",
      qty: 2,
      unit_price_cents: 75000,
      line_total_cents: 150000,
    }),
  ],
});

describe("waybill HTML is unchanged by document requisites", () => {
  const service = new TemplateService();
  beforeAll(async () => {
    await service.ready;
  });

  it.each(Object.values(ReceiptTemplate))("%s", async (style) => {
    const data = service.prepareTemplateData(
      order,
      "2026-000001",
      {
        companyName: "Company",
        companyAddress: "Addr",
        companyEmail: "c@example.com",
        companyPhone: "+380441112233",
        companyTaxId: "12345678",
        companyIban: "UA213223130000026007233566001",
        companySwift: "SWIFT",
        companyWebsite: "https://example.com",
        companyTagline: "Tag",
      },
      false,
      undefined,
      "Invoice",
      "uk",
      "Footer",
      "Sub",
      "#3B82F6",
      "Terms",
      "Delivery",
    );
    const html = await service.renderTemplate(style, {
      ...data,
      generatedAt: "fixed",
    });
    const digest = createHash("sha256").update(html).digest("hex");
    expect(digest).toBe(GOLDEN_SHA256[style]);
  });
});

describe("waybill labels", () => {
  const service = new TemplateService();
  beforeAll(async () => {
    await service.ready;
  });

  const render = (
    style: ReceiptTemplate,
    language: string,
    recipientAddress = "Kyiv",
  ) => {
    const withAddress = Object.assign(new Order(), order, {
      recipient: Object.assign(new Recipient(), order.recipient, {
        address: recipientAddress,
      }),
    });
    const data = service.prepareTemplateData(
      withAddress,
      "2026-000001",
      { companyName: "Company" },
      false,
      undefined,
      undefined,
      language,
    );
    return service.renderTemplate(style, { ...data, generatedAt: "fixed" });
  };

  const NUMBERED_STYLES = [
    ReceiptTemplate.CLASSIC,
    ReceiptTemplate.CORPORATE,
    ReceiptTemplate.BRANDED,
    ReceiptTemplate.DARK,
    ReceiptTemplate.PROFORMA,
    ReceiptTemplate.VINTAGE,
    ReceiptTemplate.DELIVERY,
    ReceiptTemplate.THERMAL,
  ];

  it.each(NUMBERED_STYLES)(
    "%s numbers a waybill as a document, not an invoice",
    async (style) => {
      for (const [language, label, invoiceLabel] of [
        ["uk", "Номер документа:", "Номер рахунку:"],
        ["ru", "Номер документа:", "Номер счета:"],
        ["en", "Document No:", "Invoice No:"],
      ]) {
        const html = await render(style, language);
        expect(html).toContain(label);
        expect(html).not.toContain(invoiceLabel);
      }
    },
  );

  it.each(Object.values(ReceiptTemplate))(
    "%s embeds both fonts as valid base64 data URLs",
    async (style) => {
      // `{{fontRegular}}` used to turn the regular font's "=" padding into "&#x3D;" inside
      // <style>, an invalid data URL (ERR_INVALID_URL), so its text printed in a system font.
      const html = await render(style, "uk");
      const fonts = [...html.matchAll(/data:font\/ttf;base64,([^')]*)/g)].map(
        (match) => match[1],
      );
      expect(fonts).toHaveLength(2);
      for (const font of fonts) expect(font).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    },
  );

  it("minimal prints no dangling separator after a recipient without an address", async () => {
    const html = await render(ReceiptTemplate.MINIMAL, "uk", "");
    const billTo =
      /<div class="info-line">\s*<span class="info-label">Кому:<\/span>([\s\S]*?)<\/div>/.exec(
        html,
      );
    expect(billTo?.[1]).toContain("Recipient");
    expect(billTo?.[1]).not.toContain("info-separator");
  });
});
