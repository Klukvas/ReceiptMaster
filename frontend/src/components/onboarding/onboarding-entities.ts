import axios from "axios";
import type {
  Product,
  Recipient,
  UpdateProductRequest,
  UpdateRecipientRequest,
} from "../../lib/api";
import {
  buildProductUpdate,
  toProductFields,
  type ProductFormValues,
} from "../products/product-update";
import type { ProductData } from "./steps/FirstProductStep";
import type { RecipientData } from "./steps/FirstRecipientStep";

export type SaveStatus = "idle" | "saving" | "saved" | "ambiguous" | "error";

/** A create sent with an Idempotency-Key whose outcome is not settled yet. */
export type PendingCreate<TBody> = {
  readonly key: string;
  readonly body: TBody;
};

/**
 * What the onboarding knows about the entity one step creates: the server's
 * copy once a create succeeded (`id`, `saved`), or the exact request to repeat
 * (`pending`) while the outcome of a create is unknown.
 */
export type EntityStep<TSaved, TBody> = {
  readonly id?: string;
  readonly saved?: TSaved;
  readonly pending?: PendingCreate<TBody>;
  readonly status: SaveStatus;
};

export type ProductCreateBody = Omit<
  Product,
  "id" | "created_at" | "updated_at"
>;
export type RecipientCreateBody = Omit<
  Recipient,
  "id" | "created_at" | "updated_at"
>;

export const EMPTY_STEP = { status: "idle" } as const;

export const isBlank = (value: string): boolean => value.trim() === "";

export const hasChanges = (update: object): boolean =>
  Object.keys(update).length > 0;

/** One key per create attempt; retries of that attempt reuse it. */
export const newIdempotencyKey = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

// A gateway answered for a backend it could not hear from: the create may
// have been committed, exactly as when no response arrived at all.
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** True when the server may or may not have applied the request. */
export const isUnconfirmedFailure = (error: unknown): boolean =>
  axios.isAxiosError(error) &&
  (error.response === undefined ||
    GATEWAY_STATUSES.has(error.response.status));

const toProductValues = (data: ProductData): ProductFormValues => ({
  name: data.name,
  purchase_price_cents: data.purchase_price,
  sale_price_cents: data.sale_price,
  quantity: String(parseInt(data.quantity, 10) || 0),
  currency: "UAH",
  supplier_id: "",
});

export const productCreateBody = (data: ProductData): ProductCreateBody => {
  const { name, purchase_price_cents, sale_price_cents, quantity, currency } =
    toProductFields(toProductValues(data));
  return { name, purchase_price_cents, sale_price_cents, quantity, currency };
};

/** Changed fields only; a changed quantity carries the stock it replaces. */
export const productUpdate = (
  saved: Product,
  data: ProductData,
): UpdateProductRequest =>
  buildProductUpdate(saved, toProductValues(data), saved.quantity);

export const recipientCreateBody = (
  data: RecipientData,
): RecipientCreateBody => ({
  name: data.name.trim(),
  email: data.email.trim() || undefined,
  phone: data.phone.trim() || undefined,
});

/** Changed fields only; a cleared email or phone is sent as null. */
export const recipientUpdate = (
  saved: Recipient,
  data: RecipientData,
): UpdateRecipientRequest => {
  const next = recipientCreateBody(data);
  const differs = (mine?: string, theirs?: string | null) =>
    (mine ?? null) !== (theirs ?? null);
  return {
    ...(next.name !== saved.name ? { name: next.name } : {}),
    ...(differs(next.email, saved.email) ? { email: next.email ?? null } : {}),
    ...(differs(next.phone, saved.phone) ? { phone: next.phone ?? null } : {}),
  };
};

/** Where a step's entity record lives; reads always see the latest write. */
export type StepStore<TSaved, TBody> = {
  readonly get: () => EntityStep<TSaved, TBody>;
  readonly set: (next: EntityStep<TSaved, TBody>) => void;
};

export type StepPlan<TSaved, TBody, TUpdate extends object> = {
  /** Blank required field: nothing new is created and nothing is changed. */
  readonly isSkipped: boolean;
  readonly body: () => TBody;
  readonly update: (saved: TSaved) => TUpdate;
  readonly sendCreate: (pending: PendingCreate<TBody>) => Promise<TSaved>;
  readonly sendUpdate: (id: string, update: TUpdate) => Promise<TSaved>;
};

const settleCreate = async <TSaved extends { id: string }, TBody>(
  store: StepStore<TSaved, TBody>,
  pending: PendingCreate<TBody>,
  sendCreate: (pending: PendingCreate<TBody>) => Promise<TSaved>,
): Promise<void> => {
  store.set({ ...store.get(), pending, status: "saving" });
  try {
    const saved = await sendCreate(pending);
    store.set({ id: saved.id, saved, status: "saved" });
  } catch (error) {
    // Unknown outcome: keep the exact request so a retry replays it. A refused
    // create saved nothing, so the next attempt sends the current form instead.
    store.set(
      isUnconfirmedFailure(error)
        ? { ...store.get(), pending, status: "ambiguous" }
        : { ...store.get(), pending: undefined, status: "error" },
    );
    throw error;
  }
};

/**
 * Saves one entity step at most once: an unsettled create is repeated with its
 * own key and body, an existing entity is only PATCHed with what changed, and an
 * unchanged revisit sends nothing. Throws the failure; the store keeps what is known.
 */
export const saveEntityStep = async <
  TSaved extends { id: string },
  TBody,
  TUpdate extends object,
>(
  store: StepStore<TSaved, TBody>,
  plan: StepPlan<TSaved, TBody, TUpdate>,
): Promise<void> => {
  const step = store.get();
  if (step.pending) {
    await settleCreate(store, step.pending, plan.sendCreate);
  } else if (!step.id) {
    if (plan.isSkipped) return;
    const pending = { key: newIdempotencyKey(), body: plan.body() };
    await settleCreate(store, pending, plan.sendCreate);
  }

  const current = store.get();
  if (!current.id || !current.saved || plan.isSkipped) return;
  const update = plan.update(current.saved);
  if (!hasChanges(update)) return;
  const saved = await plan.sendUpdate(current.id, update);
  store.set({ ...store.get(), saved, status: "saved" });
};
