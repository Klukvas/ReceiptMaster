// Deterministic API fixtures for the e2e regression suite.
// Kept intentionally small: only the shapes the exercised screens actually read.

export const USER = {
  id: "user-1",
  email: "e2e@example.com",
  role: "user",
  created_at: "2026-01-01T00:00:00.000Z",
};

const PLAN_FEATURES = [
  "analytics",
  "profit",
  "csvExport",
  "logo",
  "signoff",
  "customNumbering",
  "autoReceipt",
  "suppliers",
  "stockInsights",
];
const features = (enabled) =>
  Object.fromEntries(PLAN_FEATURES.map((feature) => [feature, enabled.includes(feature)]));

// The three plans as `GET /subscription/status` reports their limits (a copy of the backend's
// PLAN_LIMITS; `plan-gating` uses the lower two).
const PLAN_LIMITS = {
  free: {
    maxProducts: 10,
    maxOrdersPerMonth: 20,
    maxRecipients: 10,
    allowedTemplateIds: ["standard"],
    allowedDocumentTypes: ["waybill", "invoice", "sales_receipt"],
    documentsRetainedPerType: 10,
    maxPresets: 0,
    analyticsHistoryDays: null,
    hasAttribution: true,
    features: features([]),
  },
  pro: {
    maxProducts: 500,
    maxOrdersPerMonth: 150,
    maxRecipients: 300,
    allowedTemplateIds: [
      "standard", "compact", "minimal", "thermal", "classic",
      "corporate", "modern", "wave", "delivery", "proforma",
    ],
    allowedDocumentTypes: null,
    documentsRetainedPerType: 100,
    maxPresets: 3,
    analyticsHistoryDays: 90,
    hasAttribution: false,
    features: features(PLAN_FEATURES.filter((feature) => feature !== "csvExport")),
  },
  business: {
    maxProducts: null,
    maxOrdersPerMonth: 1500,
    maxRecipients: null,
    allowedTemplateIds: null,
    allowedDocumentTypes: null,
    documentsRetainedPerType: null,
    maxPresets: 20,
    analyticsHistoryDays: null,
    hasAttribution: false,
    features: features(PLAN_FEATURES),
  },
};

/** A subscription status for one of the stored plans: "free", "pro" (Start) or "business" (Pro). */
export const subscriptionStatusFor = (plan, usage = {}) => ({
  plan,
  usage: { productsCount: 3, ordersThisMonth: 1, recipientsCount: 1, ...usage },
  limits: PLAN_LIMITS[plan],
  billingStatus: null,
  currentPeriodEnd: null,
  hasBillingSubscription: false,
});

// The top plan, so specs that are not about plans see everything unlocked.
export const SUBSCRIPTION_STATUS = subscriptionStatusFor("business");

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
  returned_qty: 0,
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
  orderNumber = 1,
}) => ({
  id,
  order_number: orderNumber,
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
          document_type: "waybill",
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
