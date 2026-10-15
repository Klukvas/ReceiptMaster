import { TemplateService, ReceiptTemplate } from "./template.service";
import { Order } from "../../orders/entities/order.entity";
import { OrderItem } from "../../orders/entities/order-item.entity";
import { Recipient } from "../../recipients/entities/recipient.entity";
import { DEFAULT_RECEIPT_TITLE } from "../templates/translations/defaults";
import { getTemplateMetadata } from "../templates/metadata";

const order = Object.assign(new Order(), {
  currency: "UAH",
  created_at: new Date("2026-10-14T12:34:00Z"),
  subtotal_cents: 0,
  total_cents: 0,
  recipient: Object.assign(new Recipient(), { name: "Recipient" }),
  items: [
    Object.assign(new OrderItem(), {
      product_name: "Product",
      qty: 2,
      unit_price_cents: 0,
      line_total_cents: 0,
    }),
  ],
});
const styles = Object.values(ReceiptTemplate);

describe("Real receipt templates", () => {
  const service = new TemplateService();
  beforeAll(async () => {
    await service.ready;
  });

  it.each(styles)(
    "%s retains independent custom footer fields",
    async (style) => {
      const data = service.prepareTemplateData(
        order,
        "TEST-123",
        { companyName: '<script>alert("test")</script>' },
        false,
        undefined,
        "CUSTOM TITLE",
        "uk",
        undefined,
        "SUBTITLE ONLY",
      );
      const html = await service.renderTemplate(style, data);
      expect(html).toContain("SUBTITLE ONLY");
      expect(html).toContain("CUSTOM TITLE");
      expect(html).toContain("TEST-123");
      expect(html).toContain(data.orderDate);
      expect(html).not.toContain('<script>alert("test")</script>');
      expect(html).not.toContain("{{");
    },
  );

  it.each(["en", "ru", "uk"])(
    "renders localised specialised defaults in %s",
    async (language) => {
      const data = service.prepareTemplateData(
        order,
        "TEST-123",
        { companyName: "Company" },
        false,
        undefined,
        DEFAULT_RECEIPT_TITLE[language],
        language,
      );
      for (const [style, key] of [
        [ReceiptTemplate.DELIVERY, "deliveryNote"],
        [ReceiptTemplate.PROFORMA, "proformaInvoice"],
      ] as const) {
        const html = await service.renderTemplate(style, data);
        expect(html).toContain(`<html lang="${language}">`);
        expect(html).toContain(data.translations[key]);
        expect(data.hasCustomReceiptTitle).toBe(false);
        const custom = await service.renderTemplate(style, {
          ...data,
          receiptTitle: "Invoice",
          hasCustomReceiptTitle: true,
        });
        expect(custom).toContain(">Invoice</div>");
      }
    },
  );

  it("waits for shared translations/fonts even when data was prepared immediately", async () => {
    const fresh = new TemplateService();
    const data = fresh.prepareTemplateData(
      order,
      "TEST-123",
      { companyName: "Company" },
      false,
      undefined,
      undefined,
      "uk",
    );
    const html = await fresh.renderTemplate(ReceiptTemplate.DELIVERY, data);
    expect(html).toContain("Видаткова накладна");
    expect(html).toContain("Отримав");
    expect(html).toMatch(/data:font\/ttf;base64,[A-Za-z0-9+/=]{100}/);
  });

  it.each([
    ReceiptTemplate.MODERN,
    ReceiptTemplate.VINTAGE,
    ReceiptTemplate.ELEGANT,
  ])("%s has no unsupported tax/unit column", async (style) => {
    const data = service.prepareTemplateData(order, "TEST-123", {
      companyName: "Company",
    });
    const html = await service.renderTemplate(style, data);
    expect(html).not.toMatch(/<(?:td|th) class="col-(?:tax|unit)">/);
  });

  it("metadata advertises only supported static PDF features", () => {
    expect(getTemplateMetadata("modern")?.features.join(" ")).not.toMatch(
      /QR/i,
    );
    expect(getTemplateMetadata("wave")?.features.join(" ")).not.toMatch(
      /Аним/i,
    );
    expect(getTemplateMetadata("thermal")?.pdfOptions).toMatchObject({
      width: "80mm",
      contentBasedHeight: true,
    });
  });
});
