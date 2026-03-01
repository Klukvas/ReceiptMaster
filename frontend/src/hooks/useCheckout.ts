import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePaddle } from "../providers/PaddleProvider";
import { useTranslation } from "./useTranslation";
import { subscriptionApi } from "../lib/subscriptionApi";
import { CheckoutEventNames } from "@paddle/paddle-js";
import toast from "react-hot-toast";

type CheckoutLoading = "pro" | "business" | "manage" | null;

export const useCheckout = () => {
  const { paddle } = usePaddle();
  const queryClient = useQueryClient();
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
        eventCallback: (data) => {
          if (data.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
            // Give the webhook a few seconds to process before refetching
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ["subscription"] });
            }, 3000);
          }
        },
      });
    } catch {
      toast.error(
        t("subscription.checkoutError", "Failed to start checkout"),
      );
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
