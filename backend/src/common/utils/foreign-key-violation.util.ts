import { QueryFailedError } from "typeorm";

// PostgreSQL SQLSTATE for foreign_key_violation.
const FOREIGN_KEY_VIOLATION = "23503";

/** True when PostgreSQL rejected a write on the named foreign key constraint. */
export function isForeignKeyViolationOf(
  error: unknown,
  constraint: string,
): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: { code?: unknown; constraint?: unknown } =
    error.driverError ?? {};
  return (
    driverError.code === FOREIGN_KEY_VIOLATION &&
    driverError.constraint === constraint
  );
}
