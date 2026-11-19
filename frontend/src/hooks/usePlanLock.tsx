import { useCallback, useState } from "react";
import { UpgradeModal } from "../components/subscription/UpgradeModal";
import {
  planDisplayName,
  planUnlocking,
  type UpgradeReason,
} from "../lib/plan-catalog";
import { useSubscription } from "./useSubscription";
import { useTranslation } from "./useTranslation";

/** "Available on Start", or "Not included in your current plan" when plans cannot be bought. */
export const usePlanLockHint = (reason: UpgradeReason): string => {
  const { t } = useTranslation();
  const { status, billingEnabled } = useSubscription();
  if (!billingEnabled) return t("subscription.planUnavailable");
  return t("subscription.availableOn", {
    plan: planDisplayName(t, planUnlocking(reason, status?.plan ?? "free")),
  });
};

/**
 * Opens the upgrade dialog from code: a limit pre-check or a 402 the server sent.
 * Render `modal` once in the component.
 */
export const useUpgradePrompt = () => {
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  // The dialog keeps its last reason while it closes, so the text does not blank out.
  const [lastReason, setLastReason] = useState<UpgradeReason>("products");
  const open = useCallback((next: UpgradeReason) => {
    setLastReason(next);
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
      />
    ),
  };
};
