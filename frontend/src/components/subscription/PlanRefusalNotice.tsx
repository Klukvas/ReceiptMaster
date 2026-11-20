import { forwardRef } from "react";
import { ExternalLink, Lock } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { useBilling } from "../../providers/BillingProvider";
import type { PlanRefusal } from "../../lib/plan-refusal";

const SUBSCRIPTION_SETTINGS_PATH = "/settings?tab=subscription";

/**
 * A plan refusal (402) shown inside the form that was refused, so everything typed stays.
 * The plans open in a new tab for the same reason: after an upgrade there the user comes
 * back to the intact form and submits again.
 */
export const PlanRefusalNotice = forwardRef<
  HTMLDivElement,
  { refusal: PlanRefusal }
>(({ refusal: { reason } }, ref) => {
  const { t } = useTranslation();
  const { billingEnabled } = useBilling();
  return (
    <div
      ref={ref}
      role="alert"
      data-testid="plan-refusal"
      className="flex items-start gap-2.5 rounded-lg border border-[var(--color-warning-light)] bg-[var(--color-warning-light)] p-3 text-sm text-content"
    >
      <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning-base" />
      <div className="min-w-0 space-y-1">
        {reason ? (
          <>
            <p className="font-medium">
              {t(`subscription.reasons.${reason}.title`)}
            </p>
            <p className="text-content-secondary">
              {t(`subscription.reasons.${reason}.description`)}
            </p>
          </>
        ) : (
          <p className="font-medium">{t("errors.planFeatureRestricted")}</p>
        )}
        {billingEnabled && (
          <a
            href={SUBSCRIPTION_SETTINGS_PATH}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="plan-refusal-upgrade"
            className="inline-flex items-center gap-1 font-medium text-accent-base underline pointer-coarse:min-h-11"
          >
            {t("subscription.viewPlansNewTab")}
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
});
PlanRefusalNotice.displayName = "PlanRefusalNotice";
