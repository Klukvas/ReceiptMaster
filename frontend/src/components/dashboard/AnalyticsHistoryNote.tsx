import { useTranslation } from "../../hooks/useTranslation";
import { PlanLockButton } from "../subscription/PlanLock";

/** Says that the plan limits how far back analytics looks, next to the period controls. */
export const AnalyticsHistoryNote = ({ days }: { days: number }) => {
  const { t } = useTranslation();
  const note = t("dashboard.historyLimited", { count: days });
  return (
    <div
      data-testid="analytics-history-note"
      className="flex flex-wrap items-center gap-2 text-sm text-content-secondary"
    >
      <span>{note}</span>
      <PlanLockButton reason="analyticsHistory" subject={note} size="sm" />
    </div>
  );
};
