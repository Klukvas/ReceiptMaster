import {
  DEFAULT_DOCUMENT_FORMATTING,
  formatDocumentDate,
  formatDocumentDateOnly,
} from "./document-formatting.util";

describe("formatDocumentDateOnly", () => {
  const instant = "2026-10-15T12:00:00Z";

  it.each([
    ["uk", "15 жовтня 2026 р."],
    ["ru", "15 октября 2026 г."],
    ["en", "October 15, 2026"],
  ])("formats %s as %s", (language, expected) => {
    expect(
      formatDocumentDateOnly(instant, language, DEFAULT_DOCUMENT_FORMATTING),
    ).toBe(expected);
  });

  it("does not shift a plain calendar date in a time zone west of UTC", () => {
    expect(
      formatDocumentDateOnly("2026-10-15", "en", {
        ...DEFAULT_DOCUMENT_FORMATTING,
        timeZone: "America/New_York",
      }),
    ).toBe("October 15, 2026");
  });

  it("falls back to English for an unknown language", () => {
    expect(
      formatDocumentDateOnly(instant, "de", DEFAULT_DOCUMENT_FORMATTING),
    ).toBe("October 15, 2026");
  });

  it("respects the configured time zone around midnight", () => {
    const lateEvening = "2026-10-14T22:30:00Z";
    const kyiv = { ...DEFAULT_DOCUMENT_FORMATTING, timeZone: "Europe/Kyiv" };
    expect(formatDocumentDateOnly(lateEvening, "uk", kyiv)).toBe(
      "15 жовтня 2026 р.",
    );
    expect(
      formatDocumentDateOnly(lateEvening, "uk", DEFAULT_DOCUMENT_FORMATTING),
    ).toBe("14 жовтня 2026 р.");
  });

  it.each(["short", "medium"] as const)(
    "never contains a clock time with timeStyle %s",
    (timeStyle) => {
      const preferences = { ...DEFAULT_DOCUMENT_FORMATTING, timeStyle };
      for (const language of ["uk", "ru", "en"]) {
        expect(
          formatDocumentDateOnly("2026-10-15T13:45:56Z", language, preferences),
        ).not.toMatch(/\d:\d/);
      }
    },
  );

  it.each(["numeric", "short", "medium"] as const)(
    "always uses the long date regardless of dateStyle %s",
    (dateStyle) => {
      const preferences = { ...DEFAULT_DOCUMENT_FORMATTING, dateStyle };
      expect(formatDocumentDateOnly(instant, "uk", preferences)).toBe(
        "15 жовтня 2026 р.",
      );
    },
  );

  it("accepts a Date instance", () => {
    expect(
      formatDocumentDateOnly(
        new Date(instant),
        "en",
        DEFAULT_DOCUMENT_FORMATTING,
      ),
    ).toBe("October 15, 2026");
  });

  it("does not mutate the preferences", () => {
    const preferences = Object.freeze({ ...DEFAULT_DOCUMENT_FORMATTING });
    formatDocumentDateOnly(instant, "uk", preferences);
    expect(preferences.dateStyle).toBe("numeric");
    expect(preferences.timeStyle).toBe("medium");
  });

  it("is identical to formatDocumentDate with dateStyle long and timeStyle none", () => {
    const longNoTime = {
      ...DEFAULT_DOCUMENT_FORMATTING,
      dateStyle: "long" as const,
      timeStyle: "none" as const,
    };
    for (const language of ["uk", "ru", "en"]) {
      expect(
        formatDocumentDateOnly(instant, language, DEFAULT_DOCUMENT_FORMATTING),
      ).toBe(formatDocumentDate(instant, language, longNoTime));
    }
  });

  it("differs from the default formatDocumentDate, which includes the time", () => {
    const withTime = formatDocumentDate(
      "2026-10-15T13:45:56Z",
      "uk",
      DEFAULT_DOCUMENT_FORMATTING,
    );
    expect(withTime).toMatch(/\d:\d/);
    expect(
      formatDocumentDateOnly(
        "2026-10-15T13:45:56Z",
        "uk",
        DEFAULT_DOCUMENT_FORMATTING,
      ),
    ).not.toBe(withTime);
  });
});
