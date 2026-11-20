import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  subscriptionApi,
  type SubscriptionStatus,
} from "../lib/subscriptionApi";
import { planDisplayName, type PaidPlan } from "../lib/plan-catalog";
import { useTranslation } from "./useTranslation";

export type SubscriptionAction = PaidPlan | "cancel" | "resume";

/**
 * Changes to a live subscription that stay inside the app: another paid plan, a
 * cancellation at the end of the period, and its undo. The server answers each with the
 * status after the change, which replaces the cached one so every plan lock follows at once.
 */
export const useSubscriptionActions = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<SubscriptionAction | null>(null);

  const run = async (
    action: SubscriptionAction,
    request: () => Promise<SubscriptionStatus>,
    successMessage: string,
    errorMessage: string,
  ): Promise<boolean> => {
    if (pending) return false;
    setPending(action);
    try {
      queryClient.setQueryData(["subscription", "status"], await request());
      toast.success(successMessage);
      return true;
    } catch (error) {
      console.error(`Subscription action (${action}) failed:`, error);
      toast.error(errorMessage);
      return false;
    } finally {
      setPending(null);
    }
  };

  /** An upgrade is charged to the saved card with no payment page, so the toast says so. */
  const changePlan = (plan: PaidPlan, { isUpgrade }: { isUpgrade: boolean }) =>
    run(
      plan,
      () => subscriptionApi.changePlan(plan),
      t(isUpgrade ? "subscription.planUpgraded" : "subscription.planChanged", {
        plan: planDisplayName(t, plan),
      }),
      t("subscription.changePlanError"),
    );

  const cancel = () =>
    run(
      "cancel",
      subscriptionApi.cancel,
      t("subscription.subscriptionCanceled"),
      t("subscription.cancelError"),
    );

  const resume = () =>
    run(
      "resume",
      subscriptionApi.resume,
      t("subscription.subscriptionResumed"),
      t("subscription.resumeError"),
    );

  return { pending, changePlan, cancel, resume };
};
