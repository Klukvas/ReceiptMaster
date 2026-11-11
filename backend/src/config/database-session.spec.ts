import { defaults } from "pg";
import { parseUtcTimestamp } from "./database-session";

describe("database session date handling", () => {
  it("reads a zone-less timestamp as UTC wall time, whatever the process zone", () => {
    expect(parseUtcTimestamp("2026-11-11 10:00:00").toISOString()).toBe(
      "2026-11-11T10:00:00.000Z",
    );
    expect(parseUtcTimestamp("2026-11-11 23:59:59.123456").toISOString()).toBe(
      "2026-11-11T23:59:59.123Z",
    );
  });

  it("leaves special values to pg's own parser", () => {
    expect(parseUtcTimestamp("infinity")).toBe(Infinity);
  });

  it("writes Dates as UTC", () => {
    expect(defaults.parseInputDatesAsUTC).toBe(true);
  });
});
