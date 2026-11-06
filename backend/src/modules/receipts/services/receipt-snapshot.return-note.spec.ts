import { Order, OrderStatus } from "../../orders/entities/order.entity";
import { UserSettings } from "../../settings/entities/user-settings.entity";
import { legacyConfig } from "../../settings/document-config";
import { DocumentType, Receipt } from "../entities/receipt.entity";
import type { DocumentRequest } from "../frozen-document";
import { resolveReturnSource } from "../return-note-ledger";
import { ReceiptSnapshotService } from "./receipt-snapshot.service";

const USER = "user-1";
const items = [
  {
    id: "item-a",
    product_name: "Товар A",
    qty: 3,
    returned_qty: 1,
    unit_price_cents: 10000,
    line_total_cents: 30000,
  },
];
const baseOrder = (overrides: Partial<Order> = {}) =>
  ({
    id: "order-1",
    order_number: 17,
    status: OrderStatus.CONFIRMED,
    currency: "UAH",
    total_cents: 30000,
    created_at: new Date("2026-10-01T21:30:00Z"),
    recipient: { name: "Покупець" },
    items,
    ...overrides,
  }) as unknown as Order;

const requestFor = (qty: number, orderItemId = "item-a"): DocumentRequest => ({
  type: DocumentType.RETURN_NOTE,
  details: { lines: [{ orderItemId, qty }] },
});

const createdAt = (iso: string) => new Date(iso);

describe("ReceiptSnapshotService goods return preflight", () => {
  let documents: Partial<Record<DocumentType, { number: string; at: Date }>>;
  let order: Order;
  let templateId: string;

  const manager = () => ({
    findOne: jest.fn(async (entity, options) => {
      if (entity === Order) return order;
      if (entity === UserSettings) return null;
      if (entity === Receipt) {
        const found = documents[options.where.document_type as DocumentType];
        return found ? { number: found.number, created_at: found.at } : null;
      }
      return null;
    }),
  });

  const build = () => {
    const db = { manager: manager() };
    const configs = {
      resolve: jest.fn(async () => ({
        config: {
          ...legacyConfig(null),
          templateId,
          documentLanguage: "uk" as const,
          company: {
            ...legacyConfig(null).company,
            companyName: "ТОВ Продавець",
          },
        },
      })),
      assertTemplate: jest.fn().mockResolvedValue(undefined),
    };
    return new ReceiptSnapshotService(
      db as never,
      configs as never,
      {} as never,
      {} as never,
    );
  };

  beforeEach(() => {
    documents = {};
    order = baseOrder();
    templateId = "standard";
  });

  it("accepts a return within what is left", async () => {
    await expect(
      build().preflight(USER, "order-1", { logoAction: "keep" }, requestFor(2)),
    ).resolves.toBeUndefined();
  });

  it.each([OrderStatus.DRAFT, OrderStatus.CANCELLED])(
    "refuses a %s order",
    async (status) => {
      order = baseOrder({ status });
      await expect(
        build().preflight(
          USER,
          "order-1",
          { logoAction: "keep" },
          requestFor(1),
        ),
      ).rejects.toMatchObject({ errorCode: "ORDER_CANNOT_BE_MODIFIED" });
    },
  );

  it.each(["thermal", "delivery"])("refuses the %s style", async (style) => {
    templateId = style;
    await expect(
      build().preflight(USER, "order-1", { logoAction: "keep" }, requestFor(1)),
    ).rejects.toMatchObject({ errorCode: "DOCUMENT_TEMPLATE_UNSUPPORTED" });
  });

  it("refuses more than is left, naming the remaining quantity, before a number exists", async () => {
    await expect(
      build().preflight(USER, "order-1", { logoAction: "keep" }, requestFor(3)),
    ).rejects.toMatchObject({
      errorCode: "RETURN_QUANTITY_EXCEEDED",
      statusCode: 422,
      details: {
        items: [{ orderItemId: "item-a", requested: 3, remaining: 2 }],
      },
    });
  });

  it("on the replace path judges the frozen lines' amount without re-checking quantities", async () => {
    // The note already holds its own pieces: 3 of 3 are reserved, none are left.
    order = baseOrder({
      items: [{ ...items[0], returned_qty: 3 }],
    } as never);
    await expect(
      build().preflight(
        USER,
        "order-1",
        { logoAction: "keep" },
        {
          type: DocumentType.RETURN_NOTE,
          details: {},
          carryOver: {
            buyer: {} as never,
            details: { returnLines: [{ orderItemId: "item-a", qty: 3 }] },
          },
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses a line that is not on the order", async () => {
    await expect(
      build().preflight(
        USER,
        "order-1",
        { logoAction: "keep" },
        requestFor(1, "other-item"),
      ),
    ).rejects.toMatchObject({ errorCode: "VALIDATION_ERROR" });
  });

  it("judges the printable amount on the returned part, not on the order total", async () => {
    // The order total cannot be printed, but the one line coming back can.
    order = baseOrder({ total_cents: -1 } as never);
    await expect(
      build().preflight(USER, "order-1", { logoAction: "keep" }, requestFor(1)),
    ).resolves.toBeUndefined();
    // Control: the same order is unprintable as a whole.
    await expect(
      build().preflight(
        USER,
        "order-1",
        { logoAction: "keep" },
        { type: DocumentType.SALES_RECEIPT, details: {} },
      ),
    ).rejects.toMatchObject({ errorCode: "DOCUMENT_AMOUNT_INVALID" });
  });
});

describe("resolveReturnSource", () => {
  const order = {
    id: "order-1",
    order_number: 17,
    created_at: new Date("2026-10-01T21:30:00Z"),
  };
  const managerWith = (
    found: Partial<Record<DocumentType, { number: string; at: string }>>,
  ) => {
    const findOne = jest.fn(async (_entity, options) => {
      const row = found[options.where.document_type as DocumentType];
      return row ? { number: row.number, created_at: new Date(row.at) } : null;
    });
    return { manager: { findOne }, findOne };
  };

  it("prefers the newest issued waybill", async () => {
    const { manager, findOne } = managerWith({
      waybill: { number: "2026-000004", at: "2026-10-05T10:00:00Z" },
      invoice: { number: "2026-000009", at: "2026-10-06T10:00:00Z" },
    });
    await expect(
      resolveReturnSource(manager as never, USER, order, "Europe/Kyiv"),
    ).resolves.toEqual({
      kind: "waybill",
      number: "2026-000004",
      date: "2026-10-05",
    });
    expect(findOne).toHaveBeenCalledWith(
      Receipt,
      expect.objectContaining({
        order: { created_at: "DESC", id: "DESC" },
        where: expect.objectContaining({
          status: "generated",
          user_id: USER,
          order_id: "order-1",
        }),
      }),
    );
  });

  it("falls back to the invoice, then to the order itself", async () => {
    const withInvoice = managerWith({
      invoice: { number: "2026-000009", at: "2026-10-06T22:30:00Z" },
    });
    await expect(
      resolveReturnSource(
        withInvoice.manager as never,
        USER,
        order,
        "Europe/Kyiv",
      ),
    ).resolves.toEqual({
      kind: "invoice",
      number: "2026-000009",
      // 22:30 UTC is already the next day in Kyiv.
      date: "2026-10-07",
    });
    await expect(
      resolveReturnSource(
        managerWith({}).manager as never,
        USER,
        order,
        "Europe/Kyiv",
      ),
    ).resolves.toEqual({ kind: "order", number: "17", date: "2026-10-02" });
  });
});
