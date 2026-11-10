import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { settingsApi } from "../../lib/api";
import { parseApiError, validationField } from "../../lib/api-errors";
import {
  fieldOfServerPath,
  formFromCompany,
  HIGHLIGHT_KEY_OF,
  MAX_BANK_NAME_LENGTH,
  MAX_LEGAL_FORM_LENGTH,
  MAX_SIGNATORY_LENGTH,
  MAX_TERM_DAYS,
  MIN_TERM_DAYS,
  updateFromForm,
  validateRequisites,
  type RequisitesErrors,
  type RequisitesField,
  type RequisitesForm,
  type VatPayerChoice,
} from "../../lib/company-requisites-form";
import { requisiteFieldId } from "../../lib/document-requisites";
import { TAX_ID_KINDS, isValidTaxId } from "../../lib/ua-requisites";
import { COMPANY_INFO_KEY, useCompanyInfo } from "../../hooks/useCompanyInfo";
import { HIGHLIGHT_CLASS, useHighlightedFields } from "../../hooks/useHighlightedFields";
import { useTranslation } from "../../hooks/useTranslation";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { selectClass } from "./document-ui";

const VAT_CHOICES: readonly VatPayerChoice[] = ["unknown", "yes", "no"];

/**
 * Seller requisites that invoices and acts print. They are saved on their own
 * (POST /settings/company-info) so they never collide with the design draft's revision.
 */
export function CompanyRequisitesCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const company = useCompanyInfo();
  const [form, setForm] = useState<RequisitesForm | null>(null);
  const highlighted = useHighlightedFields(company.isSuccess && form !== null);
  const [serverErrors, setServerErrors] = useState<RequisitesErrors>({});
  const [shownErrors, setShownErrors] = useState<RequisitesErrors>({});

  const saved = company.data ? formFromCompany(company.data) : null;
  const savedJson = JSON.stringify(saved);
  const previousSaved = useRef<string | null>(null);
  // Seed once, and follow the stored values again whenever the form is still untouched.
  useEffect(() => {
    if (!saved) return;
    const previous = previousSaved.current;
    previousSaved.current = savedJson;
    setForm((current) =>
      current === null || JSON.stringify(current) === previous ? saved : current,
    );
    // `saved` is derived from savedJson, which is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedJson]);

  const isDirty = form !== null && saved !== null && JSON.stringify(form) !== savedJson;
  useUnsavedChangesGuard(isDirty, "settings.requisites.discardConfirm");

  const save = useMutation({
    mutationFn: (values: RequisitesForm) => settingsApi.updateCompanyInfo(updateFromForm(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: COMPANY_INFO_KEY });
      toast.success(t("settings.requisites.saved"));
    },
    onError: (error: unknown) => {
      const field = fieldOfServerPath(validationField(error));
      if (field) setServerErrors({ [field]: "settings.requisites.errors.serverInvalid" });
      toast.error(parseApiError(error).message);
    },
  });

  if (company.isError)
    return (
      <section className="rounded-xl border border-[var(--color-border)] bg-elevated p-5" role="alert">
        <p className="text-sm">{t("settings.loadFailed")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => company.refetch()}>
          {t("common.retry")}
        </Button>
      </section>
    );
  if (!form || !saved) return null;

  const errors: RequisitesErrors = { ...shownErrors, ...serverErrors };
  const setField = <F extends RequisitesField>(field: F, value: RequisitesForm[F]) => {
    setForm({ ...form, [field]: value });
    setServerErrors({});
    setShownErrors({ ...shownErrors, [field]: undefined });
  };
  const submit = () => {
    const found = validateRequisites(form);
    setShownErrors(found);
    if (Object.keys(found).length === 0) save.mutate(form);
  };
  const markedClass = (field: RequisitesField) => {
    const key = HIGHLIGHT_KEY_OF[field];
    return key && highlighted.has(key) ? HIGHLIGHT_CLASS : undefined;
  };
  const errorOf = (field: RequisitesField) => (errors[field] ? t(errors[field]) : undefined);
  const taxId = company.data?.companyTaxId.trim() ?? "";
  const isKindMismatch =
    form.taxIdKind !== "" && taxId !== "" && !isValidTaxId(taxId, form.taxIdKind);

  return (
    <section
      aria-labelledby="company-requisites-heading"
      className="rounded-xl border border-[var(--color-border)] bg-elevated p-5 space-y-4"
    >
      <div>
        <h3 id="company-requisites-heading" className="font-semibold text-content">
          {t("settings.requisites.title")}
        </h3>
        <p className="text-sm text-content-secondary">{t("settings.requisites.description")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="requisite-taxIdKind" className="block text-sm font-medium text-content-secondary">
            {t("settings.requisites.taxIdKind")}
          </label>
          <select
            id="requisite-taxIdKind"
            className={`${selectClass} ${markedClass("taxIdKind") ?? ""}`}
            value={form.taxIdKind}
            onChange={(event) => setField("taxIdKind", event.target.value as RequisitesForm["taxIdKind"])}
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
          <label htmlFor={requisiteFieldId("seller.vatPayer")} className="block text-sm font-medium text-content-secondary">
            {t("settings.requisites.vatPayer")}
          </label>
          <select
            id={requisiteFieldId("seller.vatPayer")}
            className={`${selectClass} ${markedClass("vatPayer") ?? ""}`}
            value={form.vatPayer}
            aria-describedby="requisite-vat-rate-note"
            onChange={(event) => setField("vatPayer", event.target.value as VatPayerChoice)}
          >
            {VAT_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t(`settings.requisites.vatChoices.${choice}`)}
              </option>
            ))}
          </select>
          {/* The rate is fixed (UA_VAT_RATE_PERCENT on the server); say so before a 7% or 14% seller issues. */}
          <p id="requisite-vat-rate-note" className="text-xs text-content-tertiary">
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
          onChange={(event) => setField("signatoryPosition", event.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={!isDirty || save.isPending} onClick={submit}>
          {save.isPending ? t("common.saving") : t("settings.requisites.save")}
        </Button>
      </div>
    </section>
  );
}
