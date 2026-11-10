import { useTranslation } from "../../hooks/useTranslation";
import { TaxIdChecksumHint } from "./TaxIdChecksumHint";
import { isValidEdrpou, isValidRnokpp, isValidUaIban, normalizeIban } from "../../lib/ua-requisites";

/**
 * Advice under the company inputs that invoices and acts read. The values are stored as
 * free text, so a doubtful one is pointed out but never blocks saving.
 */
export function CompanyFieldNote({ field, value }: { field: string; value: string }) {
  const { t } = useTranslation();
  const text = value.trim();
  if (text === "") return null;
  const key = noteKeyFor(field, text);
  if (!key && field === "companyTaxId") return <TaxIdChecksumHint value={text} className="mt-1" />;
  return key ? (
    <p role="status" className="mt-1 text-xs text-warning-base">
      {t(key)}
    </p>
  ) : null;
}

function noteKeyFor(field: string, text: string): string | null {
  if (field === "companyIban")
    return isValidUaIban(normalizeIban(text)) ? null : "settings.requisites.ibanNote";
  if (field === "companyTaxId")
    return isValidEdrpou(text) || isValidRnokpp(text) ? null : "settings.requisites.taxIdNote";
  return null;
}
