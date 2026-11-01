import { DateRangeDto } from "./date-range.dto";

const rangeEndingAt = (endDate?: string) =>
  Object.assign(new DateRangeDto(), { endDate });

describe("DateRangeDto.endDateParsed", () => {
  it("includes the whole day for a date-only end", () => {
    expect(rangeEndingAt("2026-11-01").endDateParsed?.toISOString()).toBe(
      "2026-11-01T23:59:59.999Z",
    );
  });

  it("keeps an explicit timestamp untouched", () => {
    expect(
      rangeEndingAt("2026-11-01T10:30:00.000Z").endDateParsed?.toISOString(),
    ).toBe("2026-11-01T10:30:00.000Z");
  });

  it("is undefined when no end date is given", () => {
    expect(rangeEndingAt().endDateParsed).toBeUndefined();
  });
});
