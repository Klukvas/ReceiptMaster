/** One key per create attempt; retries of that attempt reuse it. */
export const newIdempotencyKey = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};
