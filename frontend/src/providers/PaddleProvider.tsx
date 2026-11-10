import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { resolvePaddleEnvironment } from "./paddle-environment";
import { resolveBillingEnabled } from "./billing-enabled";
import { isPaddleAllowedOn } from "./paddle-route";

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

/** The Paddle instance when the build flag, the backend and the env all allow billing, else null. */
async function initializeBilling(): Promise<Paddle | null> {
  const { data } = await api.get<{ billingEnabled: boolean }>("/billing/config");
  if (data.billingEnabled !== true) return null;
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
  const configuredEnvironment = import.meta.env.VITE_PADDLE_ENVIRONMENT;
  if (!token || (import.meta.env.PROD && configuredEnvironment !== "production")) {
    throw new Error(
      "Enabled production billing requires a client token and production environment",
    );
  }
  const instance = await initializePaddle({
    token,
    environment: resolvePaddleEnvironment(configuredEnvironment, import.meta.env.PROD),
  });
  return instance ?? null;
}

export const PaddleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [isLoading, setIsLoading] = useState(buildBillingEnabled);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const isAllowedHere = isPaddleAllowedOn(useLocation().pathname);

  // One initialization per page load: leaving for /r/ and coming back reuses it instead of
  // loading the SDK again, and a navigation mid-way does not throw the result away.
  const initializationRef = useRef<Promise<Paddle | null> | null>(null);

  useEffect(() => {
    if (!buildBillingEnabled || !isAllowedHere) return;
    let active = true;
    initializationRef.current ??= initializeBilling().catch((error: unknown) => {
      console.error("Payment initialization failed:", error);
      return null;
    });
    void initializationRef.current.then((instance) => {
      if (!active) return;
      if (instance) {
        setPaddle(instance);
        setBillingEnabled(true);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isAllowedHere]);

  const value = useMemo(
    () => ({ paddle, isLoading: isAllowedHere && isLoading, billingEnabled }),
    [paddle, isAllowedHere, isLoading, billingEnabled],
  );

  return (
    <PaddleContext.Provider value={value}>
      {children}
    </PaddleContext.Provider>
  );
};
