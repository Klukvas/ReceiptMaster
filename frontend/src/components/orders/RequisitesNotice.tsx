import { AlertTriangle, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "../../hooks/useTranslation";
import {
  buyerRecipientLink,
  sellerSettingsLink,
  type RequisiteGaps,
} from "../../lib/document-requisites";

type RequisitesNoticeProps = {
  gaps: RequisiteGaps;
  recipientId: string;
  /** The server refused generation (alert) or this is a forecast before sending (status). */
  isRefusal: boolean;
};

/** Fields named "details.*" are filled in this very dialog, not on a settings or recipient form. */
const isDialogField = (key: string): boolean => key.startsWith("details.");

function FieldList({ keys }: { keys: readonly string[] }) {
  const { t } = useTranslation();
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {keys.map((key) => (
        <li key={key}>
          {isDialogField(key)
            ? t("documents.fieldInThisDialog", { field: t(`documentFields.${key}`) })
            : t(`documentFields.${key}`)}
        </li>
      ))}
    </ul>
  );
}

// The links open in a new tab so the details typed into the dialog are still there afterwards.
const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

function FixLinks({
  keys,
  recipientId,
}: {
  keys: readonly string[];
  recipientId: string;
}) {
  const { t } = useTranslation();
  const hasSeller = keys.some((key) => key.startsWith("seller."));
  const hasBuyer = keys.some((key) => key.startsWith("buyer."));
  const linkClass = "text-sm font-medium text-accent-base underline";
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {hasSeller && (
        <Link to={sellerSettingsLink(keys)} className={linkClass} {...NEW_TAB}>
          {t("documents.fillSellerRequisites")}
          <span className="sr-only"> {t("common.opensInNewTab")}</span>
        </Link>
      )}
      {hasBuyer && (
        <Link to={buyerRecipientLink(recipientId, keys)} className={linkClass} {...NEW_TAB}>
          {t("documents.fillBuyerRequisites")}
          <span className="sr-only"> {t("common.opensInNewTab")}</span>
        </Link>
      )}
    </div>
  );
}

/** Missing requisites: the blocking ones as a banner, the soft ones as a neutral note. */
export function RequisitesNotice({
  gaps,
  recipientId,
  isRefusal,
}: RequisitesNoticeProps) {
  const { t } = useTranslation();
  const hasBlocking = gaps.fields.length > 0;
  return (
    <div className="space-y-3">
      {hasBlocking && (
        <div
          role={isRefusal ? "alert" : "status"}
          data-testid="requisites-missing"
          className="space-y-2 rounded-lg border border-[var(--color-warning-light)] bg-[var(--color-warning-light)] p-3 text-sm text-content"
        >
          <p className="flex items-center gap-2 font-medium text-warning-base">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
            {t(isRefusal ? "documents.requisitesRefusedTitle" : "documents.requisitesMissingTitle")}
          </p>
          <FieldList keys={gaps.fields} />
          <FixLinks keys={gaps.fields} recipientId={recipientId} />
        </div>
      )}
      {gaps.warnings.length > 0 && (
        <div
          role="status"
          data-testid="requisites-warnings"
          className="space-y-2 rounded-lg bg-surface-alt p-3 text-sm text-content-secondary"
        >
          <p className="flex items-center gap-2 font-medium text-content">
            <Info className="h-4 w-4 flex-shrink-0" aria-hidden />
            {t("documents.requisitesWarningsTitle")}
          </p>
          <FieldList keys={gaps.warnings} />
          <FixLinks keys={gaps.warnings} recipientId={recipientId} />
        </div>
      )}
    </div>
  );
}
