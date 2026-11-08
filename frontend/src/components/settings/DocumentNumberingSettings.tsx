import { Hash, Info } from "lucide-react";
import { Skeleton } from "../ui/Skeleton";
import { useDocumentNumbering } from "../../hooks/useDocumentNumbering";
import { useTranslation } from "../../hooks/useTranslation";
import { NumberingRow } from "./NumberingRow";
import { SettingsLoadError } from "./SettingsLoadError";
import { SettingsSection } from "./SettingsSection";

export const DocumentNumberingSettings = () => {
  const { t } = useTranslation();
  const { data: settings, isLoading, error, refetch } = useDocumentNumbering();

  return (
    <SettingsSection
      title={t("numbering.title")}
      description={t("numbering.description")}
      icon={<Hash className="h-4 w-4" aria-hidden />}
    >
      <div
        role="note"
        className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--color-accent-light)] px-3 py-2 text-sm text-accent-base"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{t("numbering.warning")}</p>
      </div>
      {error ? (
        <SettingsLoadError retry={refetch} />
      ) : isLoading || !settings ? (
        <div className="space-y-3" aria-busy="true" aria-label={t("common.loading")}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {settings.map((setting) => (
            <NumberingRow key={setting.documentType} setting={setting} />
          ))}
        </div>
      )}
    </SettingsSection>
  );
};
