import { ConfirmModal } from "../ui/ConfirmModal";
import { useTranslation } from "../../hooks/useTranslation";
import { formatDateOnly } from "../../lib/api";
import {
  isHigherPlan,
  planDisplayName,
  planMonthlyPrice,
  type PaidPlan,
} from "../../lib/plan-catalog";
import type { SubscriptionStatus } from "../../lib/subscriptionApi";

/** What the user asked for and has not confirmed yet. */
export type SubscriptionIntent = PaidPlan | "cancel";

interface SubscriptionChangeConfirmProps {
  intent: SubscriptionIntent | null;
  status: SubscriptionStatus | undefined;
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Says what the change costs before it happens: an upgrade is charged at once, a downgrade
 * is not refunded, a cancellation keeps the plan until the paid period ends.
 */
export const SubscriptionChangeConfirm = ({
  intent,
  status,
  isLoading,
  onConfirm,
  onClose,
}: SubscriptionChangeConfirmProps) => {
  const { t } = useTranslation();
  if (!intent || !status) return null;

  const currentName = planDisplayName(t, status.plan);
  if (intent === "cancel") {
    return (
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        isLoading={isLoading}
        variant="danger"
        title={t("subscription.cancelTitle")}
        message={
          status.currentPeriodEnd
            ? t("subscription.cancelConfirm", {
                plan: currentName,
                date: formatDateOnly(status.currentPeriodEnd),
              })
            : t("subscription.cancelConfirmNoDate", { plan: currentName })
        }
        confirmLabel={t("subscription.cancelAction")}
        dismissLabel={t("subscription.keepSubscription")}
      />
    );
  }

  const isUpgrade = isHigherPlan(intent, status.plan);
  return (
    <ConfirmModal
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      variant={isUpgrade ? "default" : "warning"}
      title={t("subscription.changePlanTitle", {
        plan: planDisplayName(t, intent),
      })}
      message={t(
        isUpgrade
          ? "subscription.upgradeConfirm"
          : "subscription.downgradeConfirm",
        { price: planMonthlyPrice(intent) },
      )}
      confirmLabel={t("subscription.changePlanAction")}
    />
  );
};
