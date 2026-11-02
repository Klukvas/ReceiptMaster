import { EntityManager } from "typeorm";

/**
 * The next receipt number for an account, e.g. "2026-000007".
 *
 * The count is per account, so a number says nothing about how many receipts other
 * accounts have. It comes from a counter on the user row that is bumped in a single
 * statement: concurrent generations queue on that row lock and never get the same
 * number, and, like the global sequence it replaces, a number is never reused even
 * when the receipt it was handed to is evicted by the retention cap. The unique index
 * on (user_id, number) is the backstop.
 */
export async function nextReceiptNumber(
  manager: EntityManager,
  userId: string,
): Promise<string> {
  const rows: Array<{ receipt_counter: number }> = await manager.query(
    `WITH bumped AS (
       UPDATE "users" SET "receipt_counter" = "receipt_counter" + 1
       WHERE "id" = $1
       RETURNING "receipt_counter"
     )
     SELECT "receipt_counter" FROM bumped`,
    [userId],
  );
  if (rows.length === 0) throw new Error(`User ${userId} not found`);
  const year = new Date().getUTCFullYear();
  return `${year}-${String(rows[0].receipt_counter).padStart(6, "0")}`;
}
