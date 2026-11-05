import { ChevronDown } from "lucide-react";
import { HIGHLIGHT_CLASS } from "../../hooks/useHighlightedFields";
import { useTranslation } from "../../hooks/useTranslation";
import { requisiteFieldId } from "../../lib/document-requisites";
import {
  MAX_BANK_NAME_LENGTH,
  MAX_LEGAL_ADDRESS_LENGTH,
  MAX_LEGAL_NAME_LENGTH,
  type RequisiteName,
  type RequisitesDraft,
  type RequisitesErrors,
} from "../../lib/recipient-requisites";
import { TAX_ID_KINDS } from "../../lib/ua-requisites";
import { selectClass } from "../settings/DocumentFormatting";
import { Input } from "../ui/Input";

type RequisitesFieldsProps = {
  draft: RequisitesDraft;
  errors: RequisitesErrors;
  isOpen: boolean;
  /** Requisite keys named by the link that opened the form, e.g. `buyer.taxId`. */
  highlighted: ReadonlySet<string>;
  onToggle: () => void;
  onChange: (name: RequisiteName, value: string) => void;
};

const BLOCK_ID = "recipient-requisites";
// 29 characters, with room for the spaces people type between groups of four.
const MAX_IBAN_INPUT_LENGTH = 40;

/** Collapsible "requisites for documents" block of the recipient form. */
export function RecipientRequisitesFields({
  draft,
  errors,
  isOpen,
  highlighted,
  onToggle,
  onChange,
}: RequisitesFieldsProps) {
  const { t } = useTranslation();
  const errorOf = (name: RequisiteName) => (errors[name] ? t(errors[name]) : undefined);
  const mark = (key: string) => (highlighted.has(key) ? HIGHLIGHT_CLASS : undefined);

  return (
    <div className="rounded-lg border border-[var(--color-border)]">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={BLOCK_ID}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-content"
      >
        {t("recipients.requisites.title")}
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div id={BLOCK_ID} className="space-y-4 border-t border-[var(--color-border)] p-3">
          <p className="text-xs text-content-tertiary">{t("recipients.requisites.hint")}</p>
          <Input
            id={requisiteFieldId("buyer.legalName")}
            label={t("recipients.requisites.legalName")}
            maxLength={MAX_LEGAL_NAME_LENGTH}
            value={draft.legal_name}
            className={mark("buyer.legalName")}
            error={errorOf("legal_name")}
            onChange={(event) => onChange("legal_name", event.target.value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              id={requisiteFieldId("buyer.taxId")}
              label={t("recipients.requisites.taxId")}
              inputMode="numeric"
              maxLength={10}
              value={draft.tax_id}
              className={mark("buyer.taxId")}
              error={errorOf("tax_id")}
              onChange={(event) => onChange("tax_id", event.target.value)}
            />
            <div className="space-y-1">
              <label htmlFor="recipient-tax-id-kind" className="block text-sm font-medium text-content-secondary">
                {t("recipients.requisites.taxIdKind")}
              </label>
              <select
                id="recipient-tax-id-kind"
                className={`${selectClass} h-10 ${mark("buyer.taxId") ?? ""}`}
                value={draft.tax_id_kind}
                onChange={(event) => onChange("tax_id_kind", event.target.value)}
              >
                <option value="">{t("recipients.requisites.taxIdKindAuto")}</option>
                {TAX_ID_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`recipients.requisites.taxIdKinds.${kind}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input
            id="recipient-iban"
            label={t("recipients.requisites.iban")}
            placeholder="UA…"
            maxLength={MAX_IBAN_INPUT_LENGTH}
            value={draft.iban}
            error={errorOf("iban")}
            onChange={(event) => onChange("iban", event.target.value)}
          />
          <Input
            id="recipient-bank-name"
            label={t("recipients.requisites.bankName")}
            maxLength={MAX_BANK_NAME_LENGTH}
            value={draft.bank_name}
            error={errorOf("bank_name")}
            onChange={(event) => onChange("bank_name", event.target.value)}
          />
          <Input
            id="recipient-legal-address"
            label={t("recipients.requisites.legalAddress")}
            maxLength={MAX_LEGAL_ADDRESS_LENGTH}
            value={draft.legal_address}
            error={errorOf("legal_address")}
            onChange={(event) => onChange("legal_address", event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
