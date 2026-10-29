import { useTranslation } from "../../hooks/useTranslation";
import { formatCurrency } from "../../lib/api";
import type { ProfitCompleteness } from "../../lib/profit";

interface ProfitStatusProps {
  profit: number | null;
  completeness: ProfitCompleteness;
  currency?: string;
}

/**
 * Says when a profit figure is not the whole story: "cost unknown" when no line
 * had a purchase cost, a "partial" badge when some lines were left out. Nothing
 * is rendered for a complete figure.
 */
export const ProfitStatus = ({
  profit,
  completeness,
  currency,
}: ProfitStatusProps) => {
  const { t } = useTranslation();
  if (completeness.profit_complete) return null;

  const detail = t("dashboard.profitPartialTooltip", {
    lines: completeness.unknown_cost_lines,
    turnover: formatCurrency(
      completeness.unknown_cost_turnover_cents,
      currency,
    ),
    defaultValue:
      "Excludes {{lines}} order line(s) with an unknown purchase cost ({{turnover}} of turnover)",
  });

  if (profit === null) {
    return (
      <span
        className="text-xs font-medium text-content-tertiary"
        title={detail}
        data-testid="profit-unknown"
      >
        {t("dashboard.profitUnknown", "Cost unknown")}
        <span className="sr-only">. {detail}</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-warning-light)] text-warning-base"
      title={detail}
      data-testid="profit-partial"
    >
      {t("dashboard.profitPartial", "Partial")}
      <span className="sr-only">. {detail}</span>
    </span>
  );
};
