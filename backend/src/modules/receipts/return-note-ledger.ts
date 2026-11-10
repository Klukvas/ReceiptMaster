import { EntityManager, In } from "typeorm";
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

type LedgerLogger = {
  warn(message: string): void;
  error(message: string): void;
};

/**
 * The one release path for a return note whose quantities come back to the order lines:
 * a voided note and a note whose generation failed. No readable lines is a warning (the
 * note still moves on, nothing can be given back); a line whose release guard refused
 * (less returned than the note says) means the ledger disagrees with an issued document,
 * so it is logged as an error with every id needed to repair it by hand.
 */
export async function releaseReturnNoteQuantities(
  manager: EntityManager,
  logger: LedgerLogger,
  note: { id: string; order_id: string; user_id: string },
  lines: readonly ReturnLine[],
  occasion: "voided" | "failed",
): Promise<void> {
  if (lines.length === 0) {
    logger.warn(
      `Return note ${note.id} (order ${note.order_id}) ${occasion} with no readable lines; its quantities were not released`,
    );
    return;
  }
  const unreleased = await releaseReturnQuantities(
    manager,
    note.user_id,
    note.order_id,
    lines,
  );
  if (unreleased.length === 0) return;
  const refused = unreleased
    .map((line) => `${line.orderItemId} qty ${line.qty}`)
    .join(", ");
  logger.error(
    `Return note ${note.id} (order ${note.order_id}, user ${note.user_id}) ${occasion}: ${unreleased.length} line(s) had less returned than the note holds and were not released: ${refused}`,
  );
}

type FrozenSnapshot = {
  document?: {
    details: { returnLines?: ReturnLine[]; returnReason?: string };
  };
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

type SourceSnapshot = {
  capturedAt?: string;
  order?: { created_at?: string };
  config?: { formatting?: { timeZone?: string } };
  publicProjection?: { companyInfo?: { receiptTitle?: string } };
  document?: { title?: string; issueDate?: string };
} | null;

/**
 * What the source document itself prints, read from its frozen snapshot so the basis of a
 * return note says what the PDF of that document says. A waybill prints its title and the
 * order date (in its own time zone); an invoice prints the issue date frozen at issue.
 */
function printedBasis(
  kind: "waybill" | "invoice",
  snapshot: SourceSnapshot | undefined,
): { title?: string; date?: string } {
  if (!snapshot) return {};
  if (kind === "invoice") {
    const { title, issueDate } = snapshot.document ?? {};
    return { title: title || undefined, date: issueDate || undefined };
  }
  const createdAt = snapshot.order?.created_at;
  const zone = snapshot.config?.formatting?.timeZone;
  return {
    title: snapshot.publicProjection?.companyInfo?.receiptTitle || undefined,
    date:
      createdAt && zone ? issueDateIn(new Date(createdAt), zone) : undefined,
  };
}

/**
 * Picks what the return is made against: the newest issued waybill, else the newest
 * issued invoice, else the order itself (its number and creation date). The title and date
 * are the ones printed in that document, not the row's creation time; a source without a
 * usable snapshot falls back to its row's creation date and the generic label.
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
      // `active_snapshot` is select:false; naming it here loads it.
      select: { number: true, created_at: true, active_snapshot: true },
      order: { created_at: "DESC", id: "DESC" },
    });
    if (!document) continue;
    const printed = printedBasis(kind, document.active_snapshot);
    return {
      kind,
      number: document.number,
      date:
        printed.date ?? issueDateIn(new Date(document.created_at), timeZone),
      ...(printed.title ? { title: printed.title } : {}),
    };
  }
  return {
    kind: "order",
    number: String(order.order_number),
    date: issueDateIn(new Date(order.created_at), timeZone),
  };
}

/**
 * A second identical request this soon is a double click or a client retry, not a second
 * return: a person does not give back the same lines twice within seconds.
 */
export const DUPLICATE_RETURN_WINDOW_SECONDS = 10;

const linesKey = (lines: readonly ReturnLine[]): string =>
  [...lines]
    .sort(byItemId)
    .map((line) => `${line.orderItemId}:${line.qty}`)
    .join(",");

/**
 * The note an identical request created a moment ago (same lines and reason, not voided or
 * failed), or null. Must run after the order row is locked: the first request has committed
 * by then, so concurrent double submits, in this process or another, find each other.
 */
export async function findRecentIdenticalReturnNote(
  manager: EntityManager,
  userId: string,
  orderId: string,
  request: { lines: readonly ReturnLine[]; reason?: string },
): Promise<Receipt | null> {
  const recent = await manager
    .createQueryBuilder(Receipt, "r")
    .addSelect(["r.active_snapshot", "r.pending_snapshot"])
    .where("r.order_id = :orderId AND r.user_id = :userId", { orderId, userId })
    .andWhere("r.document_type = :type", { type: DocumentType.RETURN_NOTE })
    .andWhere({
      status: In([ReceiptStatus.PROCESSING, ReceiptStatus.GENERATED]),
    })
    .andWhere(
      `r.created_at > now() - interval '${DUPLICATE_RETURN_WINDOW_SECONDS} seconds'`,
    )
    .getMany();
  const wanted = linesKey(request.lines);
  const match = recent.find((note) => {
    const snapshot = note.active_snapshot ?? note.pending_snapshot;
    return (
      linesKey(frozenReturnLines(note)) === wanted &&
      (snapshot?.document?.details.returnReason ?? "") ===
        (request.reason ?? "")
    );
  });
  if (!match) return null;
  return manager.findOneOrFail(Receipt, {
    where: { id: match.id, user_id: userId },
  });
}
