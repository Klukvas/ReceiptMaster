import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOnReturnToTab } from "./useOnReturnToTab";

export const SUBSCRIPTION_STATUS_KEY = ["subscription", "status"] as const;

/**
 * The plan changes when the backend receives the provider's webhook, which can arrive
 * after the redirect back. Re-checks spread over ~20 seconds cover that lag, then stop.
 */
const RETURN_RECHECK_DELAYS_MS = [2_000, 5_000, 10_000, 20_000] as const;

const useRefreshStatus = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      // A fetch already in flight is the answer; a second one would only race it.
      void queryClient.refetchQueries(
        { queryKey: SUBSCRIPTION_STATUS_KEY },
        { cancelRefetch: false },
      ),
    [queryClient],
  );
};

/**
 * Keeps the plan fresh for a user who paid or changed the subscription elsewhere (the
 * checkout or the billing portal, possibly in another tab): the status is asked again
 * when they come back to this tab and when the page is restored from the back/forward cache.
 */
export const useSubscriptionRefreshOnReturn = (): void => {
  const refresh = useRefreshStatus();
  useOnReturnToTab(true, refresh);
  useEffect(() => {
    const refreshAfterRestore = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener("pageshow", refreshAfterRestore);
    return () => window.removeEventListener("pageshow", refreshAfterRestore);
  }, [refresh]);
};

/**
 * For Settings → Subscription: asks for the status when the tab is shown and, when the
 * page was opened straight on it (where the provider sends the user back to), a few more
 * times while the webhook may still be on its way.
 */
export const useSubscriptionRefreshOnOpen = (shouldRecheck: boolean): void => {
  const refresh = useRefreshStatus();
  useEffect(() => {
    refresh();
    if (!shouldRecheck) return;
    const timers = RETURN_RECHECK_DELAYS_MS.map((delay) =>
      window.setTimeout(refresh, delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [refresh, shouldRecheck]);
};
