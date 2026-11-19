import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

/** Creem sends related entities either expanded or as a bare id, depending on the event. */
const entityReferenceSchema = z.union([
  z.string(),
  z.object({ id: z.string() }).passthrough(),
]);

const subscriptionSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().nullish(),
    product: entityReferenceSchema.nullish(),
    customer: entityReferenceSchema.nullish(),
    current_period_end_date: z.string().nullish(),
    metadata: z.record(z.unknown()).nullish(),
  })
  .passthrough();

const checkoutSchema = z
  .object({
    id: z.string().min(1),
    product: entityReferenceSchema.nullish(),
    customer: entityReferenceSchema.nullish(),
    subscription: subscriptionSchema.nullish(),
    metadata: z.record(z.unknown()).nullish(),
  })
  .passthrough();

const eventSchema = z
  .object({
    id: z.string().min(1),
    eventType: z.string().min(1),
    // Epoch milliseconds; automatic retries keep it, so it orders events.
    created_at: z.number().nullish(),
    object: z.unknown(),
  })
  .passthrough();

export type CreemEvent = z.infer<typeof eventSchema>;
export type CreemSubscription = z.infer<typeof subscriptionSchema>;
export type CreemCheckout = z.infer<typeof checkoutSchema>;
type EntityReference = z.infer<typeof entityReferenceSchema>;

/** HMAC-SHA256 of the raw request body with the webhook secret, hex-encoded. */
export function isValidCreemSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature.trim(), "hex");
  // timingSafeEqual throws on a length mismatch, which a malformed header would cause.
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

export function parseCreemEvent(rawBody: string): CreemEvent {
  return eventSchema.parse(JSON.parse(rawBody));
}

export function parseCreemSubscription(payload: unknown): CreemSubscription {
  return subscriptionSchema.parse(payload);
}

export function parseCreemCheckout(payload: unknown): CreemCheckout {
  return checkoutSchema.parse(payload);
}

export function referenceId(
  reference: EntityReference | null | undefined,
): string | null {
  if (!reference) return null;
  return typeof reference === "string" ? reference : reference.id;
}
