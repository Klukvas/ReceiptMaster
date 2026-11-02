import { QueryFailedError } from "typeorm";

// PostgreSQL SQLSTATE for unique_violation.
const UNIQUE_VIOLATION = "23505";

/**
 * True when PostgreSQL rejected a write on the named unique constraint. For a
 * unique index (including a partial one) Postgres reports the index name as
 * the constraint, so pass the index name.
 */
export function isUniqueViolationOf(
  error: unknown,
  constraint: string,
): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: { code?: unknown; constraint?: unknown } =
    error.driverError ?? {};
  return (
    driverError.code === UNIQUE_VIOLATION &&
    driverError.constraint === constraint
  );
}

/**
 * Like `isUniqueViolationOf`, for a constraint whose generated name is not
 * known: matches on the `Key (column)=(value)` detail Postgres attaches.
 */
export function isUniqueViolationOnColumn(
  error: unknown,
  column: string,
): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: { code?: unknown; detail?: unknown } =
    error.driverError ?? {};
  return (
    driverError.code === UNIQUE_VIOLATION &&
    typeof driverError.detail === "string" &&
    driverError.detail.startsWith(`Key (${column})=`)
  );
}
