/** Element ids of the detail inputs of the create-document dialog, by the error key that points at them. */
const DETAIL_FIELD_IDS: Readonly<Record<string, string>> = {
  dueDate: "document-due-date",
  paymentTermDays: "document-term-days",
  contractRef: "document-contract-ref",
  periodFrom: "document-period-from",
  periodTo: "document-period-to",
  validUntil: "document-valid-until",
  paymentTerms: "document-payment-terms",
  deliveryTerms: "document-delivery-terms",
  reason: "document-return-reason",
};

const RETURN_QTY_PREFIX = "qty:";
const FIRST_RETURN_CHECKBOX = '[data-testid="return-lines"] input[type="checkbox"]:not(:disabled)';

/** Moves focus to the input a detail error belongs to, so a keyboard user lands on what to fix. */
export function focusDetailsField(field: string): void {
  const target = field.startsWith(RETURN_QTY_PREFIX)
    ? document.getElementById(`return-qty-${field.slice(RETURN_QTY_PREFIX.length)}`)
    : field === "lines"
      ? document.querySelector<HTMLElement>(FIRST_RETURN_CHECKBOX)
      : document.getElementById(DETAIL_FIELD_IDS[field] ?? "");
  target?.focus();
}
