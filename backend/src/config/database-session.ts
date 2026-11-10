import { defaults, types } from "pg";

/**
 * Startup options for every PostgreSQL connection. The session time zone is pinned to UTC:
 * date filters and `now()` arithmetic in queries assume UTC wall time, and a server or role
 * default (`ALTER ROLE ... SET timezone`, a managed database's local zone) must not shift
 * them. Passed through TypeORM's `extra` to the pg pool, which sends it as the `options`
 * startup parameter.
 */
export const DB_SESSION_OPTIONS = "-c timezone=UTC";

// OID of `timestamp without time zone`, the type of most date columns here.
const TIMESTAMP_WITHOUT_TIME_ZONE = 1114;
const WALL_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
const parseTimestampDefault = types.getTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE);

/** A stored UTC wall time as the instant it names; `infinity` and BC dates keep pg's parser. */
export function parseUtcTimestamp(value: string): Date {
  return WALL_TIME.test(value)
    ? new Date(`${value.replace(" ", "T")}Z`)
    : (parseTimestampDefault(value) as Date);
}

/**
 * The columns hold UTC wall time without a zone. node-postgres would read them as the
 * process's local time and write Dates with the local offset (which such a column drops),
 * so a backend not running in UTC (a developer's machine) shifted every time by its offset.
 * Production containers run in UTC, where both settings change nothing. Every entry point
 * (app, migration CLI) reaches the database through a config that imports this module.
 */
types.setTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE, parseUtcTimestamp);
defaults.parseInputDatesAsUTC = true;
