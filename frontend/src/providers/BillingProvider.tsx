import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { resolveBillingEnabled } from "./billing-enabled";
import { isBillingAllowedOn } from "./billing-route";

interface BillingContextValue {
  isLoading: boolean;
  billingEnabled: boolean;
}
const buildBillingEnabled = resolveBillingEnabled(
  import.meta.env.VITE_BILLING_ENABLED,
);
const BillingContext = createContext<BillingContextValue>({
  isLoading: false,
  billingEnabled: false,
});
export const useBilling = () => useContext(BillingContext);

/** True only when the backend reports the billing capability; the build flag is checked by the caller. */
async function fetchBillingEnabled(): Promise<boolean> {
  const { data } = await api.get<{ billingEnabled: boolean }>("/billing/config");
  return data.billingEnabled === true;
}

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLoading, setIsLoading] = useState(buildBillingEnabled);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const isAllowedHere = isBillingAllowedOn(useLocation().pathname);

  // One check per page load: leaving for /r/ and coming back reuses it, and a navigation
  // mid-way does not throw the result away.
  const checkRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!buildBillingEnabled || !isAllowedHere) return;
    let active = true;
    checkRef.current ??= fetchBillingEnabled().catch((error: unknown) => {
      console.error("Billing capability check failed:", error);
      return false;
    });
    void checkRef.current.then((isEnabled) => {
      if (!active) return;
      setBillingEnabled(isEnabled);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isAllowedHere]);

  const value = useMemo(
    () => ({ isLoading: isAllowedHere && isLoading, billingEnabled }),
    [isAllowedHere, isLoading, billingEnabled],
  );

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
};
