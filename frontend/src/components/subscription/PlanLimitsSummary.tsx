import { useTranslation } from "../../hooks/useTranslation";
import type { SubscriptionLimits } from "../../lib/subscriptionApi";

/**
 * What the current plan includes besides the counted usage, read from the API's `limits`
 * (never from the display catalogue), as a compact two-column list.
 */
export const PlanLimitsSummary = ({ limits }: { limits: SubscriptionLimits }) => {
  const { t } = useTranslation();
  const countOrAll = (count: number | null | undefined): string =>
    count === null || count === undefined
      ? t("subscription.limits.all")
      : String(count);
  const included = (isIncluded: boolean): string =>
    t(isIncluded ? "subscription.limits.included" : "subscription.limits.notIncluded");
  const analytics = !limits.features.analytics
    ? t("subscription.limits.notIncluded")
    : limits.analyticsHistoryDays === null
      ? t("subscription.limits.wholeHistory")
      : t("subscription.limits.lastDays", { count: limits.analyticsHistoryDays });

  const rows: { key: string; value: string }[] = [
    { key: "templates", value: countOrAll(limits.allowedTemplateIds?.length) },
    { key: "documentTypes", value: countOrAll(limits.allowedDocumentTypes?.length) },
    { key: "documentsKept", value: countOrAll(limits.documentsRetainedPerType) },
    {
      key: "presets",
      value: limits.maxPresets > 0 ? String(limits.maxPresets) : included(false),
    },
    { key: "analytics", value: analytics },
    { key: "csvExport", value: included(limits.features.csvExport) },
    {
      key: "branding",
      value: included(limits.features.logo && limits.features.signoff),
    },
    { key: "customNumbering", value: included(limits.features.customNumbering) },
    { key: "autoReceipt", value: included(limits.features.autoReceipt) },
    {
      key: "suppliersAndStock",
      value: included(limits.features.suppliers && limits.features.stockInsights),
    },
  ];

  return (
    <div data-testid="plan-limits-summary" className="mt-4 border-t border-[var(--color-border)] pt-4">
      <h3 className="mb-2 text-sm font-medium text-content">
        {t("subscription.limits.heading")}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-3">
            <dt className="text-content-tertiary">
              {t(`subscription.limits.${row.key}`)}
            </dt>
            <dd className="text-right font-medium tabular-nums text-content-secondary">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {limits.hasAttribution && (
        <p className="mt-2 text-xs text-content-tertiary">
          {t("subscription.limits.attribution")}
        </p>
      )}
    </div>
  );
};
