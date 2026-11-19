import { useSubscription } from "./useSubscription";
import { planAllows, type PlanFeature } from "../lib/subscriptionApi";

/**
 * The account's plan as the UI gates on it. `allows` follows the rule in
 * `lib/subscriptionApi.ts`: an unknown status locks nothing. `isSettled` is false only
 * while the first status request is in flight; queries to plan-gated endpoints wait for
 * it, so a Free account does not send requests that would be answered 402.
 */
export const usePlan = () => {
  const { status, isLoading, billingEnabled } = useSubscription();
  return {
    status,
    limits: status?.limits,
    isSettled: !isLoading,
    billingEnabled,
    allows: (feature: PlanFeature): boolean => planAllows(status, feature),
  };
};
