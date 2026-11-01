import { ValidationPipe } from "@nestjs/common";
import { DateRangeDto } from "./date-range.dto";

describe("DateRangeDto", () => {
  // The options main.ts installs: the getters only exist on a transformed DTO.
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  const parseQuery = (query: Record<string, string>): Promise<DateRangeDto> =>
    pipe.transform(query, { type: "query", metatype: DateRangeDto });

  it("includes the whole selected day in a date-only endDate", async () => {
    const range = await parseQuery({ endDate: "2026-10-30" });

    expect(range.endDateParsed?.toISOString()).toBe("2026-10-30T23:59:59.999Z");
  });

  it("keeps an order created later on the end date inside the range", async () => {
    const orderCreatedAt = new Date("2026-10-30T18:45:00.000Z");
    const range = await parseQuery({
      startDate: "2026-10-23",
      endDate: "2026-10-30",
    });

    expect(orderCreatedAt.getTime()).toBeGreaterThanOrEqual(
      range.startDateParsed?.getTime() ?? Infinity,
    );
    expect(orderCreatedAt.getTime()).toBeLessThanOrEqual(
      range.endDateParsed?.getTime() ?? -Infinity,
    );
  });

  it("does not spill into the day after the end date", async () => {
    const range = await parseQuery({ endDate: "2026-10-30" });

    expect(range.endDateParsed?.getTime()).toBeLessThan(
      new Date("2026-10-31T00:00:00.000Z").getTime(),
    );
  });

  it("treats a full timestamp as an exact upper bound", async () => {
    const range = await parseQuery({ endDate: "2026-10-30T12:00:00.000Z" });

    expect(range.endDateParsed?.toISOString()).toBe("2026-10-30T12:00:00.000Z");
  });

  it("starts a date-only startDate at the beginning of the day", async () => {
    const range = await parseQuery({ startDate: "2026-10-23" });

    expect(range.startDateParsed?.toISOString()).toBe(
      "2026-10-23T00:00:00.000Z",
    );
  });

  it("leaves absent bounds undefined", async () => {
    const range = await parseQuery({});

    expect(range.startDateParsed).toBeUndefined();
    expect(range.endDateParsed).toBeUndefined();
  });

  it("rejects a malformed endDate", async () => {
    await expect(parseQuery({ endDate: "not-a-date" })).rejects.toThrow();
  });
});
