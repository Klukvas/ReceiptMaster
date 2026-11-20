import { Check, CreditCard, Crown, Loader2 } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import {
  PLAN_ORDER,
  isHigherPlan,
  planDisplayName,
  planFeatureLines,
  planMonthlyPrice,
  type PaidPlan,
} from "../../lib/plan-catalog";
import {
  canCancelSubscription,
  canChangePlan,
  hasLiveSubscription,
  type PlanName,
  type SubscriptionStatus,
} from "../../lib/subscriptionApi";
import { PLAN_COLORS } from "./plan-colors";

interface PlanCardsProps {
  status: SubscriptionStatus | undefined;
  /** The plan or action in flight; every card button is disabled meanwhile. */
  busy: string | null;
  /** No subscription yet: the plan is bought on the provider's checkout page. */
  onCheckout: (plan: PaidPlan) => void;
  /** A live subscription moves to another paid plan. */
  onSwitch: (plan: PaidPlan) => void;
  /** The Free card of a paying account: the subscription is cancelled. */
  onCancel: () => void;
}

interface CardAction {
  run: () => void;
  isRaise: boolean;
}

const CROWN_COLORS: Record<PlanName, string> = {
  business: "text-purple-500 dark:text-purple-400",
  pro: "text-accent-base",
  free: "text-content-tertiary",
};

const RAISE_BUTTON: Record<PaidPlan, string> = {
  business:
    "text-white bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600",
  pro: "text-white bg-accent-base hover:bg-accent-base-hover",
};
const LOWER_BUTTON =
  "text-content border border-[var(--color-border)] bg-elevated hover:bg-surface-alt";

export const PlanCards = ({
  status,
  busy,
  onCheckout,
  onSwitch,
  onCancel,
}: PlanCardsProps) => {
  const { t } = useTranslation();
  const currentPlan = status?.plan ?? "free";

  /** What a click on the card's button does, or null when the card offers nothing. */
  const actionFor = (plan: PlanName): CardAction | null => {
    if (plan === currentPlan) return null;
    const isRaise = isHigherPlan(plan, currentPlan);
    if (plan === "free") {
      return canCancelSubscription(status)
        ? { run: onCancel, isRaise: false }
        : null;
    }
    if (canChangePlan(status)) return { run: () => onSwitch(plan), isRaise };
    // A subscription that is ending or unpaid is settled first; nothing is sold next to it.
    if (hasLiveSubscription(status) || !isRaise) return null;
    return { run: () => onCheckout(plan), isRaise: true };
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {PLAN_ORDER.map((plan) => {
        const isCurrent = currentPlan === plan;
        const colors = PLAN_COLORS[plan];
        const action = actionFor(plan);

        return (
          <div
            key={plan}
            className={`relative flex flex-col rounded-xl border-2 p-5 ${colors.border} ${colors.bg} ${
              isCurrent ? "ring-2 ring-[var(--color-ring)]" : ""
            }`}
          >
            {isCurrent && (
              <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-accent-base text-white text-xs rounded-full font-medium">
                {t("subscription.currentPlan", "Current Plan")}
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <Crown className={`h-5 w-5 ${CROWN_COLORS[plan]}`} />
              <h4 className="font-semibold text-content">
                {planDisplayName(t, plan)}
              </h4>
              <span className="ml-auto text-sm font-medium tabular-nums text-content-secondary">
                {planMonthlyPrice(plan)}
                {t("subscription.perMonth")}
              </span>
            </div>

            <ul className="space-y-2 mb-4">
              {planFeatureLines(t, plan).map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-content-secondary"
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 text-success-base shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            {action && (
              <button
                type="button"
                onClick={action.run}
                disabled={!!busy}
                className={`mt-auto w-full flex items-center justify-center gap-2 py-2 pointer-coarse:min-h-11 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  action.isRaise && plan !== "free"
                    ? RAISE_BUTTON[plan]
                    : LOWER_BUTTON
                }`}
              >
                {busy === plan ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  action.isRaise && <CreditCard className="h-4 w-4" />
                )}
                {t("subscription.switchTo", {
                  plan: planDisplayName(t, plan),
                })}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
