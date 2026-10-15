/** Missing configuration is disabled; all other values must be explicit booleans. */
export function resolveBillingEnabled(value: unknown): boolean {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new Error("VITE_BILLING_ENABLED must be true or false");
}
