import { useState } from "react";
import { usePaddle } from "../providers/PaddleProvider";
import { useTranslation } from "./useTranslation";
import { subscriptionApi } from "../lib/subscriptionApi";
import toast from "react-hot-toast";

type CheckoutLoading = "pro" | "business" | "manage" | null;

export const useCheckout = () => {
  const { paddle } = usePaddle();
  const { t } = useTranslation();
  const [loading, setLoading] = useState<CheckoutLoading>(null);

  const handleUpgrade = async (plan: "pro" | "business") => {
    setLoading(plan);
    try {
      const { transactionId } = await subscriptionApi.checkout(plan);

      // H6: Only proceed if paddle is available, show error otherwise
      if (!paddle) {
        toast.error(
          t(
            "subscription.paddleUnavailable",
            "Payment system unavailable. Please refresh the page.",
          ),
        );
        return;
      }

      // H7: Use Paddle eventCallback instead of arbitrary setTimeout
      paddle.Checkout.open({
        transactionId,
        settings: {
          displayMode: "overlay",
          theme: document.documentElement.classList.contains("dark")
            ? "dark"
            : "light",
          successUrl: window.location.origin + "/settings?tab=subscription",
        },
      } as Parameters<typeof paddle.Checkout.open>[0]);
    } catch {
      toast.error(t("subscription.checkoutError", "Failed to start checkout"));
    } finally {
      setLoading(null);
    }
  };

  const handleManage = async () => {
    setLoading("manage");
    try {
      const { url } = await subscriptionApi.portal();
      window.open(url, "_blank");
    } catch {
      toast.error(
        t("subscription.portalError", "Failed to open billing portal"),
      );
    } finally {
      setLoading(null);
    }
  };

  return { loading, handleUpgrade, handleManage };
};
