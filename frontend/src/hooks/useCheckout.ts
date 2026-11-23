import { useEffect, useState } from "react";
import { useBilling } from "../providers/BillingProvider";
import { useTranslation } from "./useTranslation";
import { subscriptionApi } from "../lib/subscriptionApi";
import toast from "react-hot-toast";

type CheckoutLoading = "pro" | "business" | "manage" | null;

export const useCheckout = () => {
  const { billingEnabled } = useBilling();
  const { t } = useTranslation();
  const [loading, setLoading] = useState<CheckoutLoading>(null);

  // Back from the provider's page can restore this one from the back/forward cache with the
  // button still busy; a restored page starts idle again.
  useEffect(() => {
    const resetAfterRestore = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(null);
    };
    window.addEventListener("pageshow", resetAfterRestore);
    return () => window.removeEventListener("pageshow", resetAfterRestore);
  }, []);

  // Both flows leave the app for a provider-hosted page. window.open after an await is
  // treated as an unrequested popup and blocked, so the page replaces this tab; the
  // provider's return link brings the user back. The button stays busy until the tab unloads.
  const redirectTo = async (
    target: Exclude<CheckoutLoading, null>,
    resolveUrl: () => Promise<string>,
    errorMessage: string,
  ) => {
    if (!billingEnabled) return;
    setLoading(target);
    try {
      window.location.assign(await resolveUrl());
    } catch (error) {
      console.error(`Billing redirect (${target}) failed:`, error);
      toast.error(errorMessage);
      setLoading(null);
    }
  };

  const handleUpgrade = (plan: "pro" | "business") =>
    redirectTo(
      plan,
      async () => (await subscriptionApi.checkout(plan)).checkoutUrl,
      t("subscription.checkoutError", "Failed to start checkout"),
    );

  const handleManage = () =>
    redirectTo(
      "manage",
      async () => (await subscriptionApi.portal()).url,
      t("subscription.portalError", "Failed to open billing portal"),
    );

  return { loading, handleUpgrade, handleManage, billingEnabled };
};
