import { Input } from "../ui/Input";
import { useReceiptDesignSettings } from "../../hooks/useReceiptDesignSettings";
import type { TFunction } from "i18next";
import { useTranslation } from "../../hooks/useTranslation";
import {
  MAX_ACT_COMPLETION_TEXT_LENGTH,
  MAX_CONTRACT_REF_LENGTH,
  MAX_PAYMENT_TERM_DAYS,
  MAX_QUOTE_TERMS_LENGTH,
  QUOTE_MAX_VALIDITY_DAYS,
  addDays,
  type ActForm,
  type DetailsErrors,
  type InvoiceForm,
  type PaymentTermMode,
  type QuoteDefaults,
  type QuoteForm,
} from "../../lib/document-details";

type FieldsProps<Form> = {
  form: Form;
  errors: DetailsErrors;
  onChange: (form: Form) => void;
};

const translated = (t: TFunction, errors: DetailsErrors, field: string) => {
  const key = errors[field];
  return key ? t(key) : undefined;
};

const TERM_MODES: readonly PaymentTermMode[] = ["days", "date"];

export function InvoiceDetailsFields({
  form,
  errors,
  onChange,
  today,
}: FieldsProps<InvoiceForm> & { today: QuoteDefaults["today"] }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-content-secondary">
        {t("documents.paymentTerm")}
      </legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {TERM_MODES.map((mode) => (
          <label key={mode} className="flex items-center gap-2 py-1 text-sm pointer-coarse:min-h-11 pointer-coarse:pr-3">
            <input
              type="radio"
              name="payment-term-mode"
              className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5"
              data-autofocus={form.mode === mode || undefined}
              checked={form.mode === mode}
              onChange={() => onChange({ ...form, mode })}
            />
            {t(`documents.paymentTermMode.${mode}`)}
          </label>
        ))}
      </div>
      {form.mode === "days" ? (
        <Input
          id="document-term-days"
          label={t("documents.paymentTermDays")}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PAYMENT_TERM_DAYS}
          value={form.days}
          onChange={(event) => onChange({ ...form, days: event.target.value })}
          error={translated(t, errors, "paymentTermDays")}
        />
      ) : (
        <Input
          id="document-due-date"
          label={t("documents.dueDate")}
          type="date"
          min={today}
          max={addDays(today, MAX_PAYMENT_TERM_DAYS)}
          value={form.dueDate}
          onChange={(event) =>
            onChange({ ...form, dueDate: event.target.value })
          }
          error={translated(t, errors, "dueDate")}
        />
      )}
    </fieldset>
  );
}

export function ActDetailsFields({
  form,
  errors,
  onChange,
}: FieldsProps<ActForm>) {
  const { t } = useTranslation();
  const design = useReceiptDesignSettings();
  // The sentence is printed in the document language, which may differ from the interface's.
  const standardText = t("documents.actCompletionStandard", { lng: design.data?.templateLanguage });
  const completionError = translated(t, errors, "completionText");
  const length = form.completionText.trim().length;
  return (
    <div className="space-y-4">
      <Input
        id="document-contract-ref"
        data-autofocus
        label={t("documents.contractRef")}
        placeholder={t("documents.contractRefPlaceholder")}
        maxLength={MAX_CONTRACT_REF_LENGTH}
        value={form.contractRef}
        onChange={(event) =>
          onChange({ ...form, contractRef: event.target.value })
        }
        error={translated(t, errors, "contractRef")}
      />
      <div className="space-y-1">
        <label htmlFor="document-completion-text" className="block text-sm font-medium text-content-secondary">
          {t("documents.completionText")}
        </label>
        <textarea
          id="document-completion-text"
          rows={3}
          maxLength={MAX_ACT_COMPLETION_TEXT_LENGTH}
          placeholder={standardText}
          aria-invalid={completionError ? true : undefined}
          aria-describedby={`document-completion-hint${completionError ? " document-completion-error" : ""}`}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          value={form.completionText}
          onChange={(event) => onChange({ ...form, completionText: event.target.value })}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-content-tertiary">
          <p id="document-completion-hint">
            {/* The standard sentence is spelled out here, because a placeholder vanishes on the first keystroke. */}
            {form.completionText.trim() === ""
              ? t("documents.completionTextStandardHint", { text: standardText })
              : t("documents.completionTextCustomHint", { text: standardText })}
          </p>
          <span data-testid="completion-text-counter" className="shrink-0 tabular-nums">
            {length}/{MAX_ACT_COMPLETION_TEXT_LENGTH}
          </span>
        </div>
        {form.completionText !== "" && (
          <button
            type="button"
            data-testid="completion-text-reset"
            className="text-xs font-medium text-accent-base hover:underline pointer-coarse:min-h-11"
            onClick={() => onChange({ ...form, completionText: "" })}
          >
            {t("documents.completionTextReset")}
          </button>
        )}
        {completionError && (
          <p id="document-completion-error" role="alert" className="text-sm text-danger-base">
            {completionError}
          </p>
        )}
      </div>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium text-content-secondary">
          {t("documents.period")}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            id="document-period-from"
            label={t("documents.periodFrom")}
            error={translated(t, errors, "periodFrom")}
            type="date"
            value={form.from}
            max={form.to || undefined}
            onChange={(event) => onChange({ ...form, from: event.target.value })}
          />
          <Input
            id="document-period-to"
            label={t("documents.periodTo")}
            error={translated(t, errors, "periodTo")}
            type="date"
            value={form.to}
            min={form.from || undefined}
            onChange={(event) => onChange({ ...form, to: event.target.value })}
          />
        </div>
        <p className="text-xs text-content-tertiary">
          {t("documents.periodHint")}
        </p>
      </fieldset>
    </div>
  );
}

export function QuoteDetailsFields({
  form,
  errors,
  onChange,
  today,
}: FieldsProps<QuoteForm> & { today: QuoteDefaults["today"] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Input
          id="document-valid-until"
          data-autofocus
          label={t("documents.validUntil")}
          type="date"
          min={today}
          max={addDays(today, QUOTE_MAX_VALIDITY_DAYS)}
          value={form.validUntil}
          onChange={(event) =>
            onChange({ ...form, validUntil: event.target.value })
          }
          error={translated(t, errors, "validUntil")}
        />
        <p className="text-xs text-content-tertiary">
          {t("documents.validUntilHint")}
        </p>
      </div>
      <Input
        id="document-payment-terms"
        label={t("documents.quotePaymentTerms")}
        placeholder={t("documents.quotePaymentTermsPlaceholder")}
        maxLength={MAX_QUOTE_TERMS_LENGTH}
        value={form.paymentTerms}
        onChange={(event) =>
          onChange({ ...form, paymentTerms: event.target.value })
        }
        error={translated(t, errors, "paymentTerms")}
      />
      <Input
        id="document-delivery-terms"
        label={t("documents.quoteDeliveryTerms")}
        placeholder={t("documents.quoteDeliveryTermsPlaceholder")}
        maxLength={MAX_QUOTE_TERMS_LENGTH}
        value={form.deliveryTerms}
        onChange={(event) =>
          onChange({ ...form, deliveryTerms: event.target.value })
        }
        error={translated(t, errors, "deliveryTerms")}
      />
    </div>
  );
}
