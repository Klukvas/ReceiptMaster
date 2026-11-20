import { useCallback, useState } from "react";
import { UpgradeModal } from "../components/subscription/UpgradeModal";
import {
  PLAN_ORDER,
  planDisplayName,
  planUnlocking,
  type UpgradeReason,
} from "../lib/plan-catalog";
import { useSubscription } from "./useSubscription";
import { useTranslation } from "./useTranslation";

/**
 * "Available on Start", or "Not included in your current plan" when plans cannot be bought.
 * The returned function takes the locked template, since templates differ in the plan
 * that has them.
 */
export const usePlanLockHintFor = (
  reason: UpgradeReason,
): ((templateId?: string) => string) => {
  const { t } = useTranslation();
  const { status, billingEnabled } = useSubscription();
  return (templateId) =>
    billingEnabled
      ? t("subscription.availableOn", {
          plan: planDisplayName(
            t,
            planUnlocking(reason, status?.plan ?? PLAN_ORDER[0], templateId),
          ),
        })
      : t("subscription.planUnavailable");
};

export const usePlanLockHint = (
  reason: UpgradeReason,
  templateId?: string,
): string => usePlanLockHintFor(reason)(templateId);

/**
 * Opens the upgrade dialog from code: a limit pre-check or a 402 the server sent.
 * Render `modal` once in the component.
 */
export const useUpgradePrompt = () => {
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  // The dialog keeps its last reason while it closes, so the text does not blank out.
  const [lastReason, setLastReason] = useState<UpgradeReason>("products");
  // Only for the "templates" reason: the locked template decides which plan is offered.
  const [templateId, setTemplateId] = useState<string>();
  const open = useCallback((next: UpgradeReason, lockedTemplateId?: string) => {
    setLastReason(next);
    setTemplateId(lockedTemplateId);
    setReason(next);
  }, []);
  return {
    isOpen: reason !== null,
    open,
    modal: (
      <UpgradeModal
        isOpen={reason !== null}
        onClose={() => setReason(null)}
        reason={reason ?? lastReason}
        templateId={templateId}
      />
    ),
  };
};
