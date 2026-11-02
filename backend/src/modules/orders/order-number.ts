import { EntityManager } from "typeorm";

/**
 * The next order number for an account: 1, 2, 3, ... in creation order.
 *
 * Soft-deleted orders are counted (raw SQL, no `deleted_at` filter), so a number is
 * never handed out twice and "order 17" always means the same order. The per-account
 * lock lasts until the caller's transaction ends, so two orders created at once get
 * different numbers; the unique index on (user_id, order_number) is the backstop.
 */
export async function nextOrderNumber(
  manager: EntityManager,
  userId: string,
): Promise<number> {
  await manager.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    ["order-number", userId],
  );
  const [{ next }] = await manager.query(
    `SELECT COALESCE(MAX("order_number"), 0) + 1 AS "next" FROM "orders" WHERE "user_id" = $1`,
    [userId],
  );
  return Number(next);
}
