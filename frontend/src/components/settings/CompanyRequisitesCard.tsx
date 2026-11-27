import {
  HIGHLIGHT_KEY_OF,
  MAX_BANK_NAME_LENGTH,
  MAX_LEGAL_FORM_LENGTH,
  MAX_SIGNATORY_LENGTH,
  MAX_TERM_DAYS,
  MIN_TERM_DAYS,
  type RequisitesField,
  type RequisitesForm,
  type VatPayerChoice,
} from "../../lib/company-requisites-form";
import { requisiteFieldId } from "../../lib/document-requisites";
import { TAX_ID_KINDS, isValidTaxId } from "../../lib/ua-requisites";
import {
  HIGHLIGHT_CLASS,
  useHighlightedFields,
} from "../../hooks/useHighlightedFields";
import type { RequisitesDraftModel } from "../../hooks/useRequisitesDraft";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { selectClass } from "./document-ui";

const VAT_CHOICES: readonly VatPayerChoice[] = ["unknown", "yes", "no"];

/**
 * Seller requisites that invoices and acts print, under the business card of Company details. Their
 * draft lives in `useRequisitesDraft` and the editor's Save bar saves it with the design.
 */
export function CompanyRequisitesCard({
  model,
  taxId,
}: {
  model: RequisitesDraftModel;
  /** The tax id as typed in the business card, so the kind is checked against the draft. */
  taxId: string;
}) {
  const { t } = useTranslation();
  const { form, errors, setField } = model;
  const highlighted = useHighlightedFields(
    model.query.isSuccess && form !== null,
  );

  if (model.query.isError)
    return (
      <section
        className="rounded-xl border border-[var(--color-border)] bg-elevated p-5"
        role="alert"
      >
        <p className="text-sm">{t("settings.loadFailed")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => model.query.refetch()}
        >
          {t("common.retry")}
        </Button>
      </section>
    );
  if (!form) return null;

  const markedClass = (field: RequisitesField) => {
    const key = HIGHLIGHT_KEY_OF[field];
    return key && highlighted.has(key) ? HIGHLIGHT_CLASS : undefined;
  };
  const errorOf = (field: RequisitesField) =>
    errors[field] ? t(errors[field]) : undefined;
  const trimmedTaxId = taxId.trim();
  const isKindMismatch =
    form.taxIdKind !== "" &&
    trimmedTaxId !== "" &&
    !isValidTaxId(trimmedTaxId, form.taxIdKind);

  return (
    <section
      aria-labelledby="company-requisites-heading"
      className="rounded-xl border border-[var(--color-border)] bg-elevated p-5 space-y-4"
    >
      <div>
        <h2
          id="company-requisites-heading"
          className="font-semibold text-content"
        >
          {t("settings.requisites.title")}
        </h2>
        <p className="text-sm text-content-secondary">
          {t("settings.requisites.description")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor="requisite-taxIdKind"
            className="block text-sm font-medium text-content-secondary"
          >
            {t("settings.requisites.taxIdKind")}
          </label>
          <select
            id="requisite-taxIdKind"
            className={`${selectClass} ${markedClass("taxIdKind") ?? ""}`}
            value={form.taxIdKind}
            onChange={(event) =>
              setField(
                "taxIdKind",
                event.target.value as RequisitesForm["taxIdKind"],
              )
            }
          >
            <option value="">{t("settings.requisites.taxIdKindAuto")}</option>
            {TAX_ID_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`settings.requisites.taxIdKinds.${kind}`)}
              </option>
            ))}
          </select>
          {isKindMismatch && (
            <p role="status" className="text-xs text-warning-base">
              {t("settings.requisites.taxIdKindMismatch")}
            </p>
          )}
        </div>
        <Input
          id={requisiteFieldId("seller.legalForm")}
          label={t("settings.requisites.legalForm")}
          placeholder={t("settings.requisites.legalFormPlaceholder")}
          maxLength={MAX_LEGAL_FORM_LENGTH}
          value={form.legalForm}
          className={markedClass("legalForm")}
          onChange={(event) => setField("legalForm", event.target.value)}
        />
        <Input
          id={requisiteFieldId("seller.bankName")}
          label={t("settings.requisites.bankName")}
          maxLength={MAX_BANK_NAME_LENGTH}
          value={form.bankName}
          className={markedClass("bankName")}
          onChange={(event) => setField("bankName", event.target.value)}
        />
        <div className="space-y-1">
          <label
            htmlFor={requisiteFieldId("seller.vatPayer")}
            className="block text-sm font-medium text-content-secondary"
          >
            {t("settings.requisites.vatPayer")}
          </label>
          <select
            id={requisiteFieldId("seller.vatPayer")}
            className={`${selectClass} ${markedClass("vatPayer") ?? ""}`}
            value={form.vatPayer}
            aria-describedby="requisite-vat-rate-note"
            onChange={(event) =>
              setField("vatPayer", event.target.value as VatPayerChoice)
            }
          >
            {VAT_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t(`settings.requisites.vatChoices.${choice}`)}
              </option>
            ))}
          </select>
          {/* The rate is fixed (UA_VAT_RATE_PERCENT on the server); say so before a 7% or 14% seller issues. */}
          <p
            id="requisite-vat-rate-note"
            className="text-xs text-content-tertiary"
          >
            {t("settings.requisites.vatRateNote")}
          </p>
        </div>
        <Input
          id={requisiteFieldId("seller.vatId")}
          label={t("settings.requisites.vatId")}
          inputMode="numeric"
          maxLength={12}
          value={form.vatId}
          className={markedClass("vatId")}
          error={errorOf("vatId")}
          onChange={(event) => setField("vatId", event.target.value)}
        />
        <Input
          id="requisite-paymentTermDays"
          label={t("settings.requisites.paymentTermDays")}
          inputMode="numeric"
          placeholder={`${MIN_TERM_DAYS}–${MAX_TERM_DAYS}`}
          value={form.paymentTermDays}
          error={errorOf("paymentTermDays")}
          onChange={(event) => setField("paymentTermDays", event.target.value)}
        />
        <Input
          id={requisiteFieldId("seller.signatoryName")}
          label={t("settings.requisites.signatoryName")}
          maxLength={MAX_SIGNATORY_LENGTH}
          value={form.signatoryName}
          className={markedClass("signatoryName")}
          onChange={(event) => setField("signatoryName", event.target.value)}
        />
        <Input
          id={requisiteFieldId("seller.signatoryPosition")}
          label={t("settings.requisites.signatoryPosition")}
          maxLength={MAX_SIGNATORY_LENGTH}
          value={form.signatoryPosition}
          className={markedClass("signatoryPosition")}
          onChange={(event) =>
            setField("signatoryPosition", event.target.value)
          }
        />
      </div>
    </section>
  );
}
