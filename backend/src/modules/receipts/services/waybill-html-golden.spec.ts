import { createHash } from "crypto";
import { TemplateService, ReceiptTemplate } from "./template.service";
import { Order } from "../../orders/entities/order.entity";
import { OrderItem } from "../../orders/entities/order-item.entity";
import { Recipient } from "../../recipients/entities/recipient.entity";

/**
 * Digests of the HTML each style produced before document requisites existed.
 * A waybill passes no `document`, so adding the requisites partial must not change
 * a single byte of its output.
 */
const GOLDEN_SHA256: Record<string, string> = {
  standard: "436fc6c725a27823227d4edf51b65c9fe23cb5304845fff600a8dadb9f8fc523",
  compact: "659c3b0a0f8b17c58c6c03889a82c0d26bce3ff224f483bd8d073ff05a466cc0",
  classic: "6498cc2efc3d2f53649d9c78de03e2f8ec6ed104301adf7fff996012d4618ac7",
  modern: "da26f4e5f5490c9a4cacc435b4ba4222757f8272fa1ccd55254f583a317b0655",
  elegant: "d98355d041a1a2dea0e6a306ce1366a03fb3773cc6da2128c21aa9d9eb5105d8",
  vintage: "6a4bbbec234a244c21a5197163e6736fbcf2d9a7c3b3413febeccefbfc13c739",
  tech: "396cf0754e948e39ef6d3064ac3673c329fea31e815391bf19a672d80eedfca7",
  wave: "f9201b9de63febb271f058e75978ddae10bea8fe682d4e250519bed0393ba018",
  minimal: "57de3f617fe00526f9c8e8329ead03032f2988fef041e5788367e7018affba9e",
  corporate: "df15771dfab207f8b933ba7f3df55af58f323f0d9c564c88a46a70d8fb23f467",
  thermal: "3ddd59b5895fcb982268766eec721537c98bfa2fe40811667349857a93cb147c",
  dark: "e3e45a3921b516a508361c92577e3ec4d68758c3323352772f356776f194b041",
  branded: "da46466a78c6bc8205f28386038db5d1836b1d531d9b71956478bfcfd9edadaa",
  delivery: "3e91fd1172a093de4911e373428cddff0d5f8805ca7e440fc24a79234e87b162",
  proforma: "a9b7cb1427530c764458c5633d4411a3d569c15e9bfe6b543d8527e0713c72ef",
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
