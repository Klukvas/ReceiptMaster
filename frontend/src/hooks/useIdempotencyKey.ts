import { useRef } from "react";
import { newIdempotencyKey } from "../lib/idempotency-key";

/**
 * The Idempotency-Key for creating one record from a form. Submitting the same payload again
 * (a retry after a lost response, a double tap) gets the same key, so the server replays the
 * first result instead of creating a second record. Changing the payload starts a new
 * attempt with a new key, because the person now means a different record.
 */
export function useIdempotencyKey() {
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  return (payload: unknown): string => {
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: newIdempotencyKey() };
    return attempt.current.key;
  };
}
