import { BarChart3 } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { PlanLockTile } from "../subscription/PlanLock";

/** The analytics page of a plan without analytics: what it would show, and the way to it. */
export const AnalyticsUpsell = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-content">
          {t("navigation.analytics", "Analytics")}
        </h1>
        <p className="mt-1 text-sm text-content-tertiary">
          {t("dashboard.subtitle")}
        </p>
      </div>
      <PlanLockTile
        reason="analytics"
        testId="analytics-upsell"
        className="p-6"
        icon={<BarChart3 aria-hidden className="h-5 w-5 text-accent-base" />}
        title={t("dashboard.locked.analyticsTitle")}
        description={t("dashboard.locked.analyticsDescription")}
      />
    </div>
  );
};
