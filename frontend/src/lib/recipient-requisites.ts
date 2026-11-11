import type { Recipient, UpdateRecipientRequest } from "./api";
import {
  inferTaxIdKind,
  isValidTaxId,
  isValidUaIban,
  normalizeIban,
  type TaxIdKind,
} from "./ua-requisites";

export const MAX_LEGAL_NAME_LENGTH = 255;
export const MAX_BANK_NAME_LENGTH = 200;
export const MAX_LEGAL_ADDRESS_LENGTH = 1000;

/** The "requisites for documents" block of the recipient form, as the inputs hold it. */
export type RequisitesDraft = {
  legal_name: string;
  tax_id: string;
  /** Empty lets the server derive the kind from the number's length. */
  tax_id_kind: TaxIdKind | "";
  iban: string;
  bank_name: string;
  legal_address: string;
};

export type RequisiteName = keyof RequisitesDraft;

/** Field → translation key of the problem. */
export type RequisitesErrors = Partial<Record<RequisiteName, string>>;

export const REQUISITE_NAMES: readonly RequisiteName[] = [
  "legal_name",
  "tax_id",
  "tax_id_kind",
  "iban",
  "bank_name",
  "legal_address",
];

type RequisitesSource = Pick<
  Recipient,
  "legal_name" | "tax_id" | "tax_id_kind" | "iban" | "bank_name" | "legal_address"
>;

export function draftFromRecipient(recipient?: RequisitesSource | null): RequisitesDraft {
  return {
    legal_name: recipient?.legal_name ?? "",
    tax_id: recipient?.tax_id ?? "",
    // The server derives the kind from the number's length, so the stored kind is never
    // an independent choice: the form starts on "by length" and an explicit pick is only
    // a check that the number matches it.
    tax_id_kind: "",
    iban: recipient?.iban ?? "",
    bank_name: recipient?.bank_name ?? "",
    legal_address: recipient?.legal_address ?? "",
  };
}

export const hasRequisites = (recipient?: RequisitesSource | null): boolean =>
  REQUISITE_NAMES.some((name) => draftFromRecipient(recipient)[name] !== "");

const compactIban = (iban: string): string => String(normalizeIban(iban.trim()));

function taxIdError(taxId: string, kind: TaxIdKind | ""): string | undefined {
  if (taxId === "") return undefined;
  if (inferTaxIdKind(taxId) === null) return "recipients.requisites.errors.taxId";
  return kind !== "" && !isValidTaxId(taxId, kind)
    ? "recipients.requisites.errors.taxIdKindMismatch"
    : undefined;
}

// The shape alone (UA + 27 digits); isValidUaIban adds the mod-97 check digits on top.
const UA_IBAN_SHAPE = /^UA\d{27}$/;

/** A well-shaped IBAN with wrong check digits is a typo, not the wrong format: say which. */
function ibanError(iban: string): string | undefined {
  if (iban === "" || isValidUaIban(iban)) return undefined;
  return UA_IBAN_SHAPE.test(iban)
    ? "recipients.requisites.errors.ibanChecksum"
    : "recipients.requisites.errors.iban";
}

export function validateRequisites(draft: RequisitesDraft): RequisitesErrors {
  const taxId = draft.tax_id.trim();
  const found: RequisitesErrors = {
    tax_id: taxIdError(taxId, draft.tax_id_kind),
    iban: ibanError(compactIban(draft.iban)),
  };
  return Object.fromEntries(
    Object.entries(found).filter(([, problem]) => problem !== undefined),
  );
}

const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

function normalizedValue(draft: RequisitesDraft, name: Exclude<RequisiteName, "tax_id_kind">) {
  const value = name === "iban" ? compactIban(draft.iban) : draft[name];
  return orNull(value);
}

const VALUE_FIELDS = ["legal_name", "tax_id", "iban", "bank_name", "legal_address"] as const;

/** Create: only the fields that were filled in. */
export function requisitesForCreate(draft: RequisitesDraft) {
  const filled = VALUE_FIELDS.flatMap((name) => {
    const value = normalizedValue(draft, name);
    return value === null ? [] : [[name, value] as const];
  });
  const hasTaxId = normalizedValue(draft, "tax_id") !== null;
  return {
    ...Object.fromEntries(filled),
    ...(hasTaxId && draft.tax_id_kind !== "" && { tax_id_kind: draft.tax_id_kind }),
  };
}

/**
 * Update: only what differs from the stored recipient; `null` clears. The server moves
 * `tax_id` and its kind together, so a kind is sent with a changed number, or alone
 * when only the kind changed and there is a number to attach it to.
 */
export function requisitesForUpdate(
  draft: RequisitesDraft,
  stored: RequisitesSource,
): UpdateRecipientRequest {
  const before = draftFromRecipient(stored);
  const changed = VALUE_FIELDS.flatMap((name) => {
    const next = normalizedValue(draft, name);
    return next === normalizedValue(before, name) ? [] : [[name, next] as const];
  });
  const patch: UpdateRecipientRequest = Object.fromEntries(changed);
  const { tax_id_kind: pickedKind } = draft;
  const nextTaxId = normalizedValue(draft, "tax_id");
  return nextTaxId !== null && pickedKind !== "" && pickedKind !== before.tax_id_kind
    ? { ...patch, tax_id_kind: pickedKind }
    : patch;
}

/** The block field a server validation path (`iban`) belongs to, if it is one of ours. */
export function requisiteOfServerPath(path: string | null): RequisiteName | null {
  return REQUISITE_NAMES.find((name) => name === path) ?? null;
}
