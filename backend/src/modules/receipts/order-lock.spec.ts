import { Order } from "../orders/entities/order.entity";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "./entities/receipt.entity";
import {
  isLockingDocumentType,
  LOCKING_DOCUMENT_TYPES,
  syncOrderLock,
} from "./order-lock";

describe("order lock", () => {
  describe("isLockingDocumentType", () => {
    it.each([
      [DocumentType.WAYBILL, true],
      [DocumentType.INVOICE, true],
      [DocumentType.ACT, true],
      [DocumentType.SALES_RECEIPT, true],
      [DocumentType.PACKING_LIST, true],
      [DocumentType.QUOTE, false],
      [DocumentType.RETURN_NOTE, false],
    ])("%s locks the order: %s", (type, expected) => {
      expect(isLockingDocumentType(type)).toBe(expected);
    });

    it("covers every document type exactly once", () => {
      const locking = Object.values(DocumentType).filter(isLockingDocumentType);
      expect([...locking].sort()).toEqual([...LOCKING_DOCUMENT_TYPES].sort());
      expect(Object.values(DocumentType)).toHaveLength(7);
    });
  });

  describe("syncOrderLock", () => {
    const managerWith = (exists: boolean) => ({
      exists: jest.fn().mockResolvedValue(exists),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });

    it("writes false when no locking document is issued", async () => {
      const manager = managerWith(false);

      const result = await syncOrderLock(manager as never, "order-1", "user-1");

      expect(result).toBe(false);
      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: "order-1", user_id: "user-1" },
        { is_locked: false },
      );
    });

    it("writes true when a locking document is issued", async () => {
      const manager = managerWith(true);

      const result = await syncOrderLock(manager as never, "order-1", "user-1");

      expect(result).toBe(true);
      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: "order-1", user_id: "user-1" },
        { is_locked: true },
      );
    });

    it("looks only at GENERATED documents of locking types, without taking locks", async () => {
      const manager = managerWith(true);

      await syncOrderLock(manager as never, "order-1", "user-1");

      const [entity, options] = manager.exists.mock.calls[0];
      expect(entity).toBe(Receipt);
      expect(options.lock).toBeUndefined();
      expect(options.where).toMatchObject({
        order_id: "order-1",
        user_id: "user-1",
        status: ReceiptStatus.GENERATED,
      });
      expect(options.where.document_type.value).toEqual([
        ...LOCKING_DOCUMENT_TYPES,
      ]);
    });
  });
});
