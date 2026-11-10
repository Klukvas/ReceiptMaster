import { useTranslation } from "../../hooks/useTranslation";
import { taxIdChecksumStatus } from "../../lib/tax-id-checksum";
import type { TaxIdKind } from "../../lib/ua-requisites";

/** A mild hint, never an error: a code can be real and still mistyped, or newly issued. */
export function TaxIdChecksumHint({
  value,
  pickedKind = "",
  className = "",
}: {
  value: string;
  pickedKind?: TaxIdKind | "";
  className?: string;
}) {
  const { t } = useTranslation();
  if (taxIdChecksumStatus(value, pickedKind) !== false) return null;
  return (
    <p
      role="status"
      data-testid="tax-id-checksum-hint"
      className={`text-xs text-warning-base ${className}`}
    >
      {t("settings.requisites.taxIdChecksumNote")}
    </p>
  );
}
