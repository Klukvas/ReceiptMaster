import React, { createContext, useContext, useEffect, useState } from "react";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { api } from "../lib/api";
import { resolvePaddleEnvironment } from "./paddle-environment";
import { resolveBillingEnabled } from "./billing-enabled";

interface PaddleContextValue {
  paddle: Paddle | null;
  isLoading: boolean;
  billingEnabled: boolean;
}
const buildBillingEnabled = resolveBillingEnabled(
  import.meta.env.VITE_BILLING_ENABLED,
);
const PaddleContext = createContext<PaddleContextValue>({
  paddle: null,
  isLoading: false,
  billingEnabled: false,
});
export const usePaddle = () => useContext(PaddleContext);

export const PaddleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [isLoading, setIsLoading] = useState(buildBillingEnabled);
  const [billingEnabled, setBillingEnabled] = useState(false);

  useEffect(() => {
    if (!buildBillingEnabled) return;
    let active = true;
    const initialize = async () => {
      const { data } = await api.get<{ billingEnabled: boolean }>(
        "/billing/config",
      );
      if (data.billingEnabled !== true) return;
      const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
      const configuredEnvironment = import.meta.env.VITE_PADDLE_ENVIRONMENT;
      if (
        !token ||
        (import.meta.env.PROD && configuredEnvironment !== "production")
      ) {
        throw new Error(
          "Enabled production billing requires a client token and production environment",
        );
      }
      const instance = await initializePaddle({
        token,
        environment: resolvePaddleEnvironment(
          configuredEnvironment,
          import.meta.env.PROD,
        ),
      });
      if (active && instance) {
        setPaddle(instance);
        setBillingEnabled(true);
      }
    };
    void initialize()
      .catch((error: unknown) =>
        console.error("Payment initialization failed:", error),
      )
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PaddleContext.Provider value={{ paddle, isLoading, billingEnabled }}>
      {children}
    </PaddleContext.Provider>
  );
};
