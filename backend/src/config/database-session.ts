/**
 * Startup options for every PostgreSQL connection. The session time zone is pinned to UTC:
 * date filters and `now()` arithmetic in queries assume UTC wall time, and a server or role
 * default (`ALTER ROLE ... SET timezone`, a managed database's local zone) must not shift
 * them. Passed through TypeORM's `extra` to the pg pool, which sends it as the `options`
 * startup parameter.
 */
export const DB_SESSION_OPTIONS = "-c timezone=UTC";
