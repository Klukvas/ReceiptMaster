// Deterministic API fixtures for the e2e regression suite.
// Kept intentionally small: only the shapes the exercised screens actually read.

export const USER = {
  id: "user-1",
  email: "e2e@example.com",
  role: "user",
  created_at: "2026-01-01T00:00:00.000Z",
};

export const SUBSCRIPTION_STATUS = {
  plan: "business",
  usage: { productsCount: 3, ordersThisMonth: 1 },
  limits: {
    maxProducts: null,
    maxOrdersPerMonth: null,
    allowedTemplateIds: null,
  },
  paddleStatus: null,
  currentPeriodEnd: null,
  hasPaddleSubscription: false,
};

// Long names on purpose: a narrow viewport must not be widened by dropdown content.
export const PRODUCTS = [
  {
    id: "product-1",
    name: "Espresso Machine Pro XL — Stainless Steel Edition",
    sku: "ESP-001",
    sale_price_cents: 129900,
    purchase_price_cents: 99900,
    quantity: 12,
    currency: "USD",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "product-2",
    name: "Ceramic Pour-Over Dripper",
    sku: "CPD-002",
    sale_price_cents: 3400,
    purchase_price_cents: 1900,
    quantity: 40,
    currency: "USD",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "product-3",
    name: "Single Origin Beans 1kg",
    sku: "SOB-003",
    sale_price_cents: 2600,
    purchase_price_cents: 1400,
    quantity: 100,
    currency: "USD",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
];

// A realistic catalogue: the selector list is long enough that the popup is
// taller than the space under the field on a small screen.
for (let i = 4; i <= 12; i += 1) {
  PRODUCTS.push({
    id: `product-${i}`,
    name: `Filter Papers V60 Size ${i} (100 pack)`,
    sku: `FPV-${i}`,
    sale_price_cents: 800 + i,
    purchase_price_cents: 400,
    quantity: 50 + i,
    currency: "USD",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  });
}

export const RECIPIENTS = [
  {
    id: "recipient-1",
    name: "Aurora Coffee Bar",
    email: "orders@aurora.example",
    phone: "+1 555 0100",
    address: "12 Market Street",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
];

const orderItem = (id, product, qty) => ({
  id,
  order_id: id.replace("item", "order"),
  product_id: product.id,
  product_name: product.name,
  qty,
  unit_price_cents: product.sale_price_cents,
  line_total_cents: product.sale_price_cents * qty,
});

/**
 * @param {{id: string, receiptId: string, receiptStatus: string, recipientName: string}} params
 */
export const makeOrder = ({
  id,
  receiptId,
  receiptStatus,
  recipientName,
  receiptNumber = "R-0001",
}) => ({
  id,
  user_id: USER.id,
  recipient_id: RECIPIENTS[0].id,
  recipient: { ...RECIPIENTS[0], name: recipientName },
  status: "confirmed",
  currency: "USD",
  subtotal_cents: 2600,
  total_cents: 2600,
  is_locked: false,
  created_at: "2026-02-01T10:00:00.000Z",
  updated_at: "2026-02-01T10:00:00.000Z",
  items: [orderItem(`item-${id}`, PRODUCTS[2], 1)],
  receipts: receiptStatus
    ? [
        {
          id: receiptId,
          order_id: id,
          number: receiptNumber,
          status: receiptStatus,
          progress: receiptStatus === "processing" ? 40 : 100,
          created_at: "2026-02-01T10:00:00.000Z",
        },
      ]
    : [],
});

export const paginated = (items) => ({
  data: items,
  total: items.length,
  offset: 0,
  limit: 10,
});
