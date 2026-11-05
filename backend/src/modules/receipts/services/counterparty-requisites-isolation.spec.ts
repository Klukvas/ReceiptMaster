import { Order } from "../../orders/entities/order.entity";
import { captureOrder, orderFingerprint } from "./document-render.service";

const orderWith = (recipient: Record<string, unknown>): Order =>
  ({
    id: "order-1",
    user_id: "user-1",
    currency: "UAH",
    subtotal_cents: 1000,
    total_cents: 1000,
    created_at: new Date("2026-10-15T12:00:00Z"),
    updated_at: new Date("2026-10-15T12:00:00Z"),
    is_locked: false,
    status: "confirmed",
    recipient: { name: "Buyer", ...recipient },
    items: [
      {
        product_name: "Item",
        qty: 1,
        unit_price_cents: 1000,
        line_total_cents: 1000,
      },
    ],
  }) as unknown as Order;

describe("buyer requisites stay out of frozen documents", () => {
  const requisites = {
    legal_name: 'ТОВ "Ромашка"',
    tax_id: "12345678",
    tax_id_kind: "edrpou",
    iban: "UA213223130000026007233566001",
    bank_name: "Bank",
    legal_address: "Kyiv",
  };

  it("does not capture them, so public receipt projections cannot expose them", () => {
    const frozen = captureOrder(orderWith(requisites));
    const serialized = JSON.stringify(frozen);

    expect(Object.keys(frozen.recipient).sort()).toEqual([
      "address",
      "email",
      "name",
      "phone",
    ]);
    expect(serialized).not.toContain("UA2132");
    expect(serialized).not.toContain("12345678");
  });

  it("leaves the order fingerprint unchanged", () => {
    expect(orderFingerprint(orderWith(requisites))).toBe(
      orderFingerprint(orderWith({})),
    );
  });
});
