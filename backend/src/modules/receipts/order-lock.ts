import { EntityManager, In } from "typeorm";
import { Order } from "../orders/entities/order.entity";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "./entities/receipt.entity";

/**
 * Document types that fix the order's lines and totals once issued, so the order
 * (and the issued document) must stay as it is. A quote is an offer that is expected
 * to be reissued, and a return note is a later event that does not freeze the sale.
 */
export const LOCKING_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.WAYBILL,
  DocumentType.INVOICE,
  DocumentType.ACT,
  DocumentType.SALES_RECEIPT,
  DocumentType.PACKING_LIST,
];

export function isLockingDocumentType(type: DocumentType): boolean {
  return LOCKING_DOCUMENT_TYPES.includes(type);
}

/**
 * Sets `orders.is_locked` to whether any locking document of the order is still
 * issued, and returns the new value. Only GENERATED counts: promotion is what locks
 * the order, and a PROCESSING or FAILED first candidate never did.
 *
 * Takes no locks of its own. The caller already holds the order row `FOR UPDATE`, so a
 * promotion of another document of the same order cannot slip in between the check and
 * the update.
 */
export async function syncOrderLock(
  manager: EntityManager,
  orderId: string,
  userId: string,
): Promise<boolean> {
  const isLocked = await manager.exists(Receipt, {
    where: {
      order_id: orderId,
      user_id: userId,
      status: ReceiptStatus.GENERATED,
      document_type: In([...LOCKING_DOCUMENT_TYPES]),
    },
  });
  await manager.update(
    Order,
    { id: orderId, user_id: userId },
    {
      is_locked: isLocked,
    },
  );
  return isLocked;
}
