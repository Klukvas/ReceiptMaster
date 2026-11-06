import { Input } from "../ui/Input";
import type { TFunction } from "i18next";
import { useTranslation } from "../../hooks/useTranslation";
import {
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
}: FieldsProps<InvoiceForm>) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-content-secondary">
        {t("documents.paymentTerm")}
      </legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {TERM_MODES.map((mode) => (
          <label key={mode} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="payment-term-mode"
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
  return (
    <div className="space-y-4">
      <Input
        id="document-contract-ref"
        label={t("documents.contractRef")}
        placeholder={t("documents.contractRefPlaceholder")}
        maxLength={MAX_CONTRACT_REF_LENGTH}
        value={form.contractRef}
        onChange={(event) =>
          onChange({ ...form, contractRef: event.target.value })
        }
        error={translated(t, errors, "contractRef")}
      />
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium text-content-secondary">
          {t("documents.period")}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            id="document-period-from"
            aria-label={t("documents.periodFrom")}
            type="date"
            value={form.from}
            max={form.to || undefined}
            onChange={(event) => onChange({ ...form, from: event.target.value })}
          />
          <Input
            id="document-period-to"
            aria-label={t("documents.periodTo")}
            type="date"
            value={form.to}
            min={form.from || undefined}
            onChange={(event) => onChange({ ...form, to: event.target.value })}
          />
        </div>
        {errors.period && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {t(errors.period)}
          </p>
        )}
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
