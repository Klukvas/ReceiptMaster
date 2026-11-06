import { EntityManager } from "typeorm";
import { ApiErrors } from "../../common/errors/ApiError";
import { Order } from "../orders/entities/order.entity";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "./entities/receipt.entity";
import { issueDateIn } from "./frozen-document";
import type { ReturnLine, ReturnSource } from "./return-note";

const RESERVE_LINE = `
  UPDATE "order_items" SET "returned_qty" = "returned_qty" + $4
  WHERE "id" = $1 AND "order_id" = $2 AND "user_id" = $3
    AND "returned_qty"::bigint + $4::bigint <= "qty"
  RETURNING "id"`;

const RELEASE_LINE = `
  UPDATE "order_items" SET "returned_qty" = "returned_qty" - $4
  WHERE "id" = $1 AND "order_id" = $2 AND "user_id" = $3 AND "returned_qty" >= $4
  RETURNING "id"`;

/**
 * The postgres driver answers an UPDATE ... RETURNING with `[rows, affectedCount]`, not
 * with the rows themselves, so "did it touch a row" cannot be read off the array length.
 */
function updatedRowCount(result: unknown): number {
  const isDriverPair =
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number";
  if (isDriverPair) return (result as [unknown[], number])[0].length;
  return Array.isArray(result) ? result.length : 0;
}

/** Ids in a fixed order, so two transactions touching the same lines never wait on each other in a cycle. */
const byItemId = (a: ReturnLine, b: ReturnLine) =>
  a.orderItemId < b.orderItemId ? -1 : a.orderItemId > b.orderItemId ? 1 : 0;

/**
 * Counts the quantities of a new return note against the order lines. Runs inside the
 * generation transaction, after the order row has been locked, and throws (rolling the
 * whole generation back) when any line has less left to return than asked for.
 */
export async function reserveReturnQuantities(
  manager: EntityManager,
  userId: string,
  orderId: string,
  lines: readonly ReturnLine[],
): Promise<void> {
  const refused: ReturnLine[] = [];
  for (const line of [...lines].sort(byItemId)) {
    const result: unknown = await manager.query(RESERVE_LINE, [
      line.orderItemId,
      orderId,
      userId,
      line.qty,
    ]);
    if (updatedRowCount(result) === 0) refused.push(line);
  }
  if (refused.length === 0) return;
  const remaining = await remainingByItem(
    manager,
    userId,
    orderId,
    refused.map((line) => line.orderItemId),
  );
  throw ApiErrors.RETURN_QUANTITY_EXCEEDED(
    refused.map((line) => ({
      orderItemId: line.orderItemId,
      requested: line.qty,
      remaining: remaining.get(line.orderItemId) ?? 0,
    })),
  );
}

async function remainingByItem(
  manager: EntityManager,
  userId: string,
  orderId: string,
  itemIds: string[],
): Promise<Map<string, number>> {
  const rows: Array<{ id: string; remaining: number }> = await manager.query(
    `SELECT "id", "qty" - "returned_qty" AS remaining FROM "order_items"
     WHERE "order_id" = $1 AND "user_id" = $2 AND "id" = ANY($3::uuid[])`,
    [orderId, userId, itemIds],
  );
  return new Map(rows.map((row) => [row.id, Number(row.remaining)]));
}

/**
 * Gives a voided note's quantities back to the lines. Returns the lines that could not be
 * released (nothing left to give back); the void itself goes ahead either way.
 */
export async function releaseReturnQuantities(
  manager: EntityManager,
  userId: string,
  orderId: string,
  lines: readonly ReturnLine[],
): Promise<ReturnLine[]> {
  const unreleased: ReturnLine[] = [];
  for (const line of [...lines].sort(byItemId)) {
    const result: unknown = await manager.query(RELEASE_LINE, [
      line.orderItemId,
      orderId,
      userId,
      line.qty,
    ]);
    if (updatedRowCount(result) === 0) unreleased.push(line);
  }
  return unreleased;
}

type FrozenSnapshot = {
  document?: { details: { returnLines?: ReturnLine[] } };
} | null;

/**
 * Return lines frozen into a note's snapshot, from the active one or else the pending
 * candidate; empty for any other document or when neither holds them.
 */
export function frozenReturnLines(receipt: {
  document_type: DocumentType;
  active_snapshot?: FrozenSnapshot;
  pending_snapshot?: FrozenSnapshot;
}): ReturnLine[] {
  if (receipt.document_type !== DocumentType.RETURN_NOTE) return [];
  return (
    receipt.active_snapshot?.document?.details.returnLines ??
    receipt.pending_snapshot?.document?.details.returnLines ??
    []
  );
}

/**
 * Picks what the return is made against: the newest issued waybill, else the newest
 * issued invoice, else the order itself (its number and creation date).
 */
export async function resolveReturnSource(
  manager: EntityManager,
  userId: string,
  order: Pick<Order, "id" | "order_number" | "created_at">,
  timeZone: string,
): Promise<ReturnSource> {
  for (const [type, kind] of [
    [DocumentType.WAYBILL, "waybill"],
    [DocumentType.INVOICE, "invoice"],
  ] as const) {
    const document = await manager.findOne(Receipt, {
      where: {
        order_id: order.id,
        user_id: userId,
        document_type: type,
        status: ReceiptStatus.GENERATED,
      },
      order: { created_at: "DESC", id: "DESC" },
    });
    if (document)
      return {
        kind,
        number: document.number,
        date: issueDateIn(new Date(document.created_at), timeZone),
      };
  }
  return {
    kind: "order",
    number: String(order.order_number),
    date: issueDateIn(new Date(order.created_at), timeZone),
  };
}
