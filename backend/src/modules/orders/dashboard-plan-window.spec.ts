import { PLAN_LIMITS, PlanLimits } from "../subscription/config/plans.config";
import {
  DashboardMetric,
  capDailyDays,
  parseDailyDays,
  resolveAnalyticsWindow,
} from "./dashboard-plan-window";

const NOW = new Date("2026-03-15T10:30:00.000Z");
const utc = (iso: string) => new Date(iso);

// Built from the unlimited plan so the tests state only the limits they are about.
const limitsWith = (overrides: {
  analytics?: boolean;
  profit?: boolean;
  analyticsHistoryDays?: number | null;
}): PlanLimits => ({
  ...PLAN_LIMITS.business,
  analyticsHistoryDays: overrides.analyticsHistoryDays ?? null,
  features: {
    ...PLAN_LIMITS.business.features,
    analytics: overrides.analytics ?? true,
    profit: overrides.profit ?? true,
  },
});

const withoutAnalytics = limitsWith({ analytics: false, profit: false });
const ninetyDays = limitsWith({ analyticsHistoryDays: 90 });
const unlimited = limitsWith({});

describe("resolveAnalyticsWindow", () => {
  describe("plan without analytics", () => {
    it("forces total turnover to the current UTC month, open-ended", () => {
      const window = resolveAnalyticsWindow(
        withoutAnalytics,
        "totalTurnover",
        { startDate: utc("2020-01-01"), endDate: utc("2020-12-31") },
        NOW,
      );

      expect(window).toEqual({
        isAllowed: true,
        startDate: utc("2026-03-01T00:00:00.000Z"),
      });
    });

    it("uses the month that is current in UTC at the last instant of a month", () => {
      const window = resolveAnalyticsWindow(
        withoutAnalytics,
        "totalTurnover",
        {},
        utc("2026-01-31T23:59:59.999Z"),
      );

      expect(window).toMatchObject({
        startDate: utc("2026-01-01T00:00:00.000Z"),
      });
    });

    it("starts a new month at UTC midnight of its first day", () => {
      const window = resolveAnalyticsWindow(
        withoutAnalytics,
        "totalTurnover",
        {},
        utc("2026-02-01T00:00:00.000Z"),
      );

      expect(window).toMatchObject({
        startDate: utc("2026-02-01T00:00:00.000Z"),
      });
    });

    it.each<DashboardMetric>(["turnoverBreakdown", "profit"])(
      "refuses %s for the analytics feature",
      (metric) => {
        expect(
          resolveAnalyticsWindow(withoutAnalytics, metric, {}, NOW),
        ).toEqual({ isAllowed: false, feature: "analytics" });
      },
    );

    it("the free plan is such a plan", () => {
      expect(
        resolveAnalyticsWindow(PLAN_LIMITS.free, "profit", {}, NOW),
      ).toEqual({ isAllowed: false, feature: "analytics" });
    });
  });

  describe("plan with analytics but without profit", () => {
    const noProfit = limitsWith({ profit: false });

    it("refuses profit metrics for the profit feature", () => {
      expect(resolveAnalyticsWindow(noProfit, "profit", {}, NOW)).toEqual({
        isAllowed: false,
        feature: "profit",
      });
    });

    it("still serves turnover breakdowns", () => {
      expect(
        resolveAnalyticsWindow(noProfit, "turnoverBreakdown", {}, NOW),
      ).toEqual({ isAllowed: true });
    });
  });

  describe("plan with a 90-day history", () => {
    // Ninety calendar days with today (15 March) as the last one.
    const earliest = utc("2025-12-16T00:00:00.000Z");

    it("clamps a wider range to the last 90 days, keeping its end", () => {
      const endDate = utc("2026-03-15T23:59:59.999Z");

      expect(
        resolveAnalyticsWindow(
          ninetyDays,
          "profit",
          { startDate: utc("2025-01-01"), endDate },
          NOW,
        ),
      ).toEqual({ isAllowed: true, startDate: earliest, endDate });
    });

    it("turns an omitted range into the last 90 days", () => {
      expect(
        resolveAnalyticsWindow(ninetyDays, "turnoverBreakdown", {}, NOW),
      ).toEqual({ isAllowed: true, startDate: earliest, endDate: undefined });
    });

    it("leaves a range inside the window alone", () => {
      const requested = {
        startDate: utc("2026-03-01"),
        endDate: utc("2026-03-10T23:59:59.999Z"),
      };

      expect(
        resolveAnalyticsWindow(ninetyDays, "totalTurnover", requested, NOW),
      ).toEqual({ isAllowed: true, ...requested });
    });

    it("keeps a start exactly on the boundary", () => {
      expect(
        resolveAnalyticsWindow(
          ninetyDays,
          "profit",
          { startDate: earliest },
          NOW,
        ),
      ).toMatchObject({ startDate: earliest });
    });

    it("yields an empty range, not an error, when the request ends before the window", () => {
      const window = resolveAnalyticsWindow(
        ninetyDays,
        "profit",
        { startDate: utc("2024-01-01"), endDate: utc("2024-12-31") },
        NOW,
      );

      expect(window).toEqual({
        isAllowed: true,
        startDate: earliest,
        endDate: utc("2024-12-31"),
      });
    });

    it("moves the boundary only at UTC midnight", () => {
      const lastInstant = resolveAnalyticsWindow(
        ninetyDays,
        "profit",
        {},
        utc("2026-03-15T23:59:59.999Z"),
      );
      const nextDay = resolveAnalyticsWindow(
        ninetyDays,
        "profit",
        {},
        utc("2026-03-16T00:00:00.000Z"),
      );

      expect(lastInstant).toMatchObject({ startDate: earliest });
      expect(nextDay).toMatchObject({
        startDate: utc("2025-12-17T00:00:00.000Z"),
      });
    });
  });

  describe("unlimited plan", () => {
    it("returns the requested range untouched", () => {
      const requested = {
        startDate: utc("2019-01-01"),
        endDate: utc("2019-12-31"),
      };

      expect(
        resolveAnalyticsWindow(unlimited, "profit", requested, NOW),
      ).toEqual({ isAllowed: true, ...requested });
    });

    it("keeps an omitted range as all time", () => {
      expect(
        resolveAnalyticsWindow(unlimited, "totalTurnover", {}, NOW),
      ).toEqual({ isAllowed: true });
    });
  });
});

describe("parseDailyDays", () => {
  it.each([
    ["14", 14],
    ["1", 1],
    ["365", 365],
    ["366", 365],
    [undefined, 7],
    ["", 7],
    ["abc", 7],
    ["0", 7],
    ["-5", 7],
    ["2.5", 7],
    ["7days", 7],
  ])("reads %p as %p", (raw, expected) => {
    expect(parseDailyDays(raw)).toBe(expected);
  });
});

describe("capDailyDays", () => {
  it("caps at the plan's history", () => {
    expect(capDailyDays(ninetyDays, 365)).toBe(90);
    expect(capDailyDays(ninetyDays, 30)).toBe(30);
  });

  it("caps an unlimited plan at a year", () => {
    expect(capDailyDays(unlimited, 5000)).toBe(365);
  });

  it("falls back to the default for a number that is not a day count", () => {
    expect(capDailyDays(unlimited, NaN)).toBe(7);
    expect(capDailyDays(unlimited, 0)).toBe(7);
  });
});
