import { OrderStatus } from "../orders/entities/order.entity";
import {
  DOCUMENT_TYPE_SPECS,
  GENERATABLE_TYPES,
  isGeneratableType,
  isMultiplePerOrder,
  isReissuableType,
} from "./document-types";
import { DocumentType } from "./entities/receipt.entity";
import { isLockingDocumentType, LOCKING_DOCUMENT_TYPES } from "./order-lock";

describe("document type specs", () => {
  it.each(GENERATABLE_TYPES)(
    "%s agrees with LOCKING_DOCUMENT_TYPES about locking",
    (type) => {
      expect(DOCUMENT_TYPE_SPECS[type].locking).toBe(
        LOCKING_DOCUMENT_TYPES.includes(type),
      );
    },
  );

  it("generates exactly waybill, invoice, act, sales receipt, packing list, quote and return note", () => {
    expect([...GENERATABLE_TYPES].sort()).toEqual([
      "act",
      "invoice",
      "packing_list",
      "quote",
      "return_note",
      "sales_receipt",
      "waybill",
    ]);
    expect(isGeneratableType(DocumentType.RETURN_NOTE)).toBe(true);
  });

  it("keeps the generatable order, so the template capabilities list does not shift", () => {
    expect(GENERATABLE_TYPES).toEqual([
      "waybill",
      "invoice",
      "act",
      "sales_receipt",
      "packing_list",
      "quote",
      "return_note",
    ]);
  });

  it.each(GENERATABLE_TYPES.filter((t) => t !== DocumentType.QUOTE))(
    "%s is issued for confirmed orders only",
    (type) => {
      expect(DOCUMENT_TYPE_SPECS[type].allowedOrderStatuses).toEqual([
        OrderStatus.CONFIRMED,
      ]);
    },
  );

  it("lets a quotation be issued for a draft or confirmed order without locking it", () => {
    const spec = DOCUMENT_TYPE_SPECS[DocumentType.QUOTE];
    expect(spec.allowedOrderStatuses).toEqual([
      OrderStatus.DRAFT,
      OrderStatus.CONFIRMED,
    ]);
    expect(spec.locking).toBe(false);
    expect(spec.requiresMoney).toBe(true);
    expect(spec.requiredSeller).toEqual(["name"]);
    expect(spec.requiredBuyer).toEqual([]);
    expect(spec.requiresVatIdForPayer).toBe(true);
    expect(spec.warnings).toEqual([
      "seller.taxId",
      "seller.legalForm",
      "seller.vatPayer",
    ]);
    expect(spec.title).toEqual({
      uk: "Комерційна пропозиція",
      ru: "Коммерческое предложение",
      en: "Quotation",
    });
    expect(spec.layout).toMatchObject({
      payment: false,
      notice: "quoteNotice",
      grandTotalLabel: "offerTotal",
      signatures: { seller: "fromSupplier", stamp: true },
    });
    expect(isReissuableType(DocumentType.QUOTE)).toBe(true);
  });

  it("describes the goods return note: several per order, no lock, money, never reissued", () => {
    const spec = DOCUMENT_TYPE_SPECS[DocumentType.RETURN_NOTE];
    expect(spec.allowedOrderStatuses).toEqual([OrderStatus.CONFIRMED]);
    expect(spec.locking).toBe(false);
    expect(spec.multiplePerOrder).toBe(true);
    expect(spec.requiresMoney).toBe(true);
    expect(spec.requiredSeller).toEqual(["name"]);
    expect(spec.requiredBuyer).toEqual([]);
    expect(spec.requiresVatIdForPayer).toBe(true);
    expect(spec.warnings).toEqual(["seller.taxId", "seller.vatPayer"]);
    expect(spec.title).toEqual({
      uk: "Накладна на повернення товару",
      ru: "Накладная на возврат товара",
      en: "Goods Return Note",
    });
    expect(spec.layout).toMatchObject({
      sellerRole: "seller",
      buyerRole: "buyer",
      notice: "returnNotice",
      grandTotalLabel: "returnTotal",
      signatures: { seller: "receivedBy", buyer: "returnedBy", stamp: false },
      allowedStyles: ["standard", "classic", "minimal", "corporate"],
    });
    expect(isReissuableType(DocumentType.RETURN_NOTE)).toBe(false);
    expect(isLockingDocumentType(DocumentType.RETURN_NOTE)).toBe(false);
  });

  it("allows several documents per order for the return note only", () => {
    expect(
      GENERATABLE_TYPES.filter((type) => isMultiplePerOrder(type)),
    ).toEqual([DocumentType.RETURN_NOTE]);
  });

  it("gives every typed document a heading in every language and the waybill none", () => {
    expect(DOCUMENT_TYPE_SPECS[DocumentType.WAYBILL].title).toBeUndefined();
    for (const type of GENERATABLE_TYPES.filter(
      (t) => t !== DocumentType.WAYBILL,
    ))
      expect(Object.keys(DOCUMENT_TYPE_SPECS[type].title ?? {}).sort()).toEqual(
        ["en", "ru", "uk"],
      );
  });

  it("titles the two new documents", () => {
    expect(DOCUMENT_TYPE_SPECS[DocumentType.SALES_RECEIPT].title).toEqual({
      uk: "Товарний чек",
      ru: "Товарный чек",
      en: "Sales Receipt",
    });
    expect(DOCUMENT_TYPE_SPECS[DocumentType.PACKING_LIST].title).toEqual({
      uk: "Пакувальний лист",
      ru: "Упаковочный лист",
      en: "Packing List",
    });
  });

  it.each(GENERATABLE_TYPES.filter((t) => t !== DocumentType.WAYBILL))(
    "%s prints money exactly when it requires money",
    (type) => {
      const spec = DOCUMENT_TYPE_SPECS[type];
      expect(spec.layout?.money).toBe(spec.requiresMoney);
    },
  );

  it("limits the new documents to the four document styles", () => {
    for (const type of [DocumentType.SALES_RECEIPT, DocumentType.PACKING_LIST])
      expect(DOCUMENT_TYPE_SPECS[type].layout?.allowedStyles).toEqual([
        "standard",
        "classic",
        "minimal",
        "corporate",
      ]);
  });
});
