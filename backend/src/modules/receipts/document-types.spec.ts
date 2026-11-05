import { OrderStatus } from "../orders/entities/order.entity";
import {
  DOCUMENT_TYPE_SPECS,
  GENERATABLE_TYPES,
  isGeneratableType,
} from "./document-types";
import { DocumentType } from "./entities/receipt.entity";
import { LOCKING_DOCUMENT_TYPES } from "./order-lock";

describe("document type specs", () => {
  it.each(GENERATABLE_TYPES)(
    "%s agrees with LOCKING_DOCUMENT_TYPES about locking",
    (type) => {
      expect(DOCUMENT_TYPE_SPECS[type].locking).toBe(
        LOCKING_DOCUMENT_TYPES.includes(type),
      );
    },
  );

  it("generates exactly waybill, invoice and act", () => {
    expect([...GENERATABLE_TYPES].sort()).toEqual([
      "act",
      "invoice",
      "waybill",
    ]);
    for (const type of [
      DocumentType.QUOTE,
      DocumentType.SALES_RECEIPT,
      DocumentType.PACKING_LIST,
      DocumentType.RETURN_NOTE,
    ])
      expect(isGeneratableType(type)).toBe(false);
  });

  it.each(GENERATABLE_TYPES)(
    "%s is issued for confirmed orders only",
    (type) => {
      expect(DOCUMENT_TYPE_SPECS[type].allowedOrderStatuses).toEqual([
        OrderStatus.CONFIRMED,
      ]);
    },
  );

  it("gives invoice and act a heading in every language and the waybill none", () => {
    expect(DOCUMENT_TYPE_SPECS[DocumentType.WAYBILL].title).toBeUndefined();
    for (const type of [DocumentType.INVOICE, DocumentType.ACT])
      expect(Object.keys(DOCUMENT_TYPE_SPECS[type].title ?? {}).sort()).toEqual(
        ["en", "ru", "uk"],
      );
  });
});
