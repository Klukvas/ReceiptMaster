import { ApiErrorResponse } from "../../common/errors/ApiError";
import type { Order } from "../orders/entities/order.entity";
import { buildDocumentRenderData } from "./services/document-view";
import { legacyConfig } from "../settings/document-config";
import type { FrozenDocument } from "./frozen-document";
import { buildBuyer, buildSeller } from "./document-requisites";
import { DocumentType } from "./entities/receipt.entity";
import {
  assertReturnable,
  buildReturnedOrder,
  findReturnShortfalls,
  returnedLineTotal,
} from "./return-note";

const item = (
  id: string,
  qty: number,
  unit: number,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  product_name: `Товар ${id}`,
  qty,
  returned_qty: 0,
  unit_price_cents: unit,
  line_total_cents: qty * unit,
  ...overrides,
});

const order = (items = [item("a", 3, 10000), item("b", 1, 25050)]) =>
  ({
    id: "order-1",
    currency: "UAH",
    created_at: new Date("2026-10-01T10:00:00Z"),
    recipient: { name: "Покупець", address: "Київ" },
    subtotal_cents: 55050,
    total_cents: 55050,
    items,
  }) as unknown as Order;

describe("returnedLineTotal", () => {
  it("keeps the stored total of a line returned in full", () => {
    // A discount baked into the stored total must survive a full return.
    expect(
      returnedLineTotal(
        { qty: 3, unit_price_cents: 10000, line_total_cents: 29000 },
        3,
      ),
    ).toBe(29000);
  });
  it("prices a partial return per piece", () => {
    expect(
      returnedLineTotal(
        { qty: 3, unit_price_cents: 10000, line_total_cents: 29000 },
        2,
      ),
    ).toBe(20000);
  });
});

describe("findReturnShortfalls", () => {
  const items = [item("a", 3, 100, { returned_qty: 1 }), item("b", 2, 100)];
  it("is empty while every line has enough left", () => {
    expect(
      findReturnShortfalls(items, [
        { orderItemId: "a", qty: 2 },
        { orderItemId: "b", qty: 2 },
      ]),
    ).toEqual([]);
  });
  it("reports requested and remaining per refused line", () => {
    expect(
      findReturnShortfalls(items, [
        { orderItemId: "a", qty: 3 },
        { orderItemId: "b", qty: 1 },
      ]),
    ).toEqual([{ orderItemId: "a", requested: 3, remaining: 2 }]);
  });
  it("treats a line the order does not have as having nothing left", () => {
    expect(
      findReturnShortfalls(items, [{ orderItemId: "zzz", qty: 1 }]),
    ).toEqual([{ orderItemId: "zzz", requested: 1, remaining: 0 }]);
  });
});

describe("assertReturnable", () => {
  const items = [item("a", 3, 100), item("b", 1, 100, { returned_qty: 1 })];
  it("accepts a return within what is left", () => {
    expect(() =>
      assertReturnable(items, [{ orderItemId: "a", qty: 3 }]),
    ).not.toThrow();
  });
  it("refuses a foreign line as a validation error", () => {
    expect(() =>
      assertReturnable(items, [{ orderItemId: "x", qty: 1 }]),
    ).toThrow(expect.objectContaining({ errorCode: "VALIDATION_ERROR" }));
  });
  it("refuses an exhausted line with 422 and the remaining quantity", () => {
    let error: ApiErrorResponse | undefined;
    try {
      assertReturnable(items, [{ orderItemId: "b", qty: 1 }]);
    } catch (thrown) {
      error = thrown as ApiErrorResponse;
    }
    expect(error?.errorCode).toBe("RETURN_QUANTITY_EXCEEDED");
    expect(error?.statusCode).toBe(422);
    expect(error?.toJSON()).toMatchObject({
      items: [{ orderItemId: "b", requested: 1, remaining: 0 }],
    });
  });
});

describe("buildReturnedOrder", () => {
  it("keeps only the returned lines and totals them", () => {
    const returned = buildReturnedOrder(order(), [
      { orderItemId: "a", qty: 2 },
    ]);
    expect(returned.items).toEqual([
      {
        product_name: "Товар a",
        qty: 2,
        unit_price_cents: 10000,
        line_total_cents: 20000,
      },
    ]);
    expect(returned.total_cents).toBe(20000);
    expect(returned.subtotal_cents).toBe(20000);
    expect(returned.currency).toBe("UAH");
    expect(returned.recipient.name).toBe("Покупець");
  });

  it("mixes a full and a partial line and keeps the order's own line order", () => {
    const returned = buildReturnedOrder(order(), [
      { orderItemId: "b", qty: 1 },
      { orderItemId: "a", qty: 1 },
    ]);
    expect(returned.items.map((line) => line.product_name)).toEqual([
      "Товар a",
      "Товар b",
    ]);
    expect(returned.total_cents).toBe(10000 + 25050);
  });

  it("produces totals the document view accepts", () => {
    const config = { ...legacyConfig(null), documentLanguage: "uk" as const };
    const returned = buildReturnedOrder(order(), [
      { orderItemId: "a", qty: 2 },
      { orderItemId: "b", qty: 1 },
    ]);
    const frozen = {
      type: DocumentType.RETURN_NOTE,
      title: "Накладна на повернення товару",
      details: {
        returnLines: [],
        returnSource: { kind: "order", number: "5", date: "2026-10-01" },
      },
      issueDate: "2026-10-15",
      seller: buildSeller(
        { ...config.company, companyName: "ТОВ" },
        { companyVatPayer: false },
      ),
      buyer: buildBuyer({ name: "Покупець" }),
      vatRatePercent: 20,
      warnings: [],
      buyerFingerprint: "x",
    } as FrozenDocument;
    const data = buildDocumentRenderData(frozen, returned, "N-1", config);
    expect(data.view.totals?.grandTotal).toMatch(/450[.,]50/);
    expect(data.view.returnInfo?.source).toBe(
      "Замовлення № 5 від 1 жовтня 2026 р.",
    );
  });

  it.each([
    ["uk", "Інвойс", "Інвойс № 2026-000004 від 2 жовтня 2026 р."],
    ["en", "Invoice", "Invoice No. 2026-000004 dated October 2, 2026"],
  ] as const)(
    "prints the source document's own heading in the basis (%s)",
    (language, title, expected) => {
      const config = { ...legacyConfig(null), documentLanguage: language };
      const frozen = {
        type: DocumentType.RETURN_NOTE,
        title: "x",
        details: {
          returnLines: [],
          returnSource: {
            kind: "waybill",
            number: "2026-000004",
            date: "2026-10-02",
            title,
          },
        },
        issueDate: "2026-10-15",
        seller: buildSeller(
          { ...config.company, companyName: "ТОВ" },
          { companyVatPayer: false },
        ),
        buyer: buildBuyer({ name: "Покупець" }),
        vatRatePercent: 20,
        warnings: [],
        buyerFingerprint: "x",
      } as FrozenDocument;
      const data = buildDocumentRenderData(
        frozen,
        buildReturnedOrder(order(), [{ orderItemId: "a", qty: 2 }]),
        "N-1",
        config,
      );
      expect(data.view.returnInfo?.source).toBe(expected);
    },
  );

  it.each([
    ["uk", "Накладна №", "Накладна № 2026-000004 від 2 жовтня 2026 р."],
    ["en", "Invoice No.", "Invoice No. 2026-000004 dated October 2, 2026"],
    ["en", "Invoice no", "Invoice no 2026-000004 dated October 2, 2026"],
    ["en", "Casino", "Casino No. 2026-000004 dated October 2, 2026"],
  ] as const)(
    "does not repeat the number sign when the title already ends with one (%s: %s)",
    (language, title, expected) => {
      const config = { ...legacyConfig(null), documentLanguage: language };
      const frozen = {
        type: DocumentType.RETURN_NOTE,
        title: "x",
        details: {
          returnLines: [],
          returnSource: {
            kind: "waybill",
            number: "2026-000004",
            date: "2026-10-02",
            title,
          },
        },
        issueDate: "2026-10-15",
        seller: buildSeller(
          { ...config.company, companyName: "ТОВ" },
          { companyVatPayer: false },
        ),
        buyer: buildBuyer({ name: "Покупець" }),
        vatRatePercent: 20,
        warnings: [],
        buyerFingerprint: "x",
      } as FrozenDocument;
      const data = buildDocumentRenderData(
        frozen,
        buildReturnedOrder(order(), [{ orderItemId: "a", qty: 2 }]),
        "N-1",
        config,
      );
      expect(data.view.returnInfo?.source).toBe(expected);
    },
  );
});
