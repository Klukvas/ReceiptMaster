import { Info, PenLine, TriangleAlert } from "lucide-react";
import { Skeleton } from "../ui/Skeleton";
import { useSignoff } from "../../hooks/useSignoff";
import { useSignoffStyleSupport } from "../../hooks/useSignoffStyleSupport";
import { useTranslation } from "../../hooks/useTranslation";
import { formatStyleList } from "../../lib/style-list";
import { SettingsLoadError } from "./SettingsLoadError";
import { SettingsSection } from "./SettingsSection";
import { SignoffUploader } from "./SignoffUploader";
import { usePlan } from "../../hooks/usePlan";

export const SignoffSettings = ({
  onChangeDesign,
}: {
  /** Opens the template choice, the only way to a design that adds the signature and stamp. */
  onChangeDesign?: () => void;
}) => {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useSignoff();
  const { isSupported, styleName, supportingStyles } = useSignoffStyleSupport();
  const isLocked = !usePlan().allows("signoff");
  // The style names come from the backend's list, so a new or retired style needs no text change.
  const styleList = (kind: "conjunction" | "disjunction") =>
    supportingStyles
      ? formatStyleList(supportingStyles, kind, (name) =>
          t("signoff.styleQuoted", { name }),
        )
      : "";

  return (
    <SettingsSection
      title={t("signoff.title")}
      description={t("signoff.description")}
      icon={<PenLine className="h-4 w-4" aria-hidden />}
    >
      <div
        role="note"
        className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--color-accent-light)] px-3 py-2 text-sm text-accent-base"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          {supportingStyles
            ? t("signoff.note", { styles: styleList("conjunction") })
            : t("signoff.noteGeneric")}
        </p>
      </div>
      {isLocked && (
        <p
          data-testid="signoff-plan-note"
          className="mb-4 text-sm text-content-secondary"
        >
          {t("signoff.notOnPlan")}
        </p>
      )}
      {isSupported === false && (
        <div
          role="status"
          data-testid="signoff-style-warning"
          className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--color-warning-light)] px-3 py-2 text-sm text-warning-base"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p>
              {supportingStyles
                ? t("signoff.styleUnsupported", {
                    style: styleName,
                    styles: styleList("disjunction"),
                  })
                : t("signoff.styleUnsupportedGeneric", { style: styleName })}
            </p>
            {onChangeDesign && (
              <button
                type="button"
                className="font-medium underline underline-offset-2 pointer-coarse:min-h-11"
                onClick={onChangeDesign}
              >
                {t("signoff.openDesign")}
              </button>
            )}
          </div>
        </div>
      )}
      {error ? (
        <SettingsLoadError retry={refetch} announcement="status" />
      ) : isLoading || !data ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          aria-busy="true"
          aria-label={t("common.loading")}
        >
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SignoffUploader
            kind="signature"
            image={data.signature}
            isLocked={isLocked}
          />
          <SignoffUploader
            kind="stamp"
            image={data.stamp}
            isLocked={isLocked}
          />
        </div>
      )}
    </SettingsSection>
  );
};
