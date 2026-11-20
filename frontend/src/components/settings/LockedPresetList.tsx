import { useState } from "react";
import type { PresetSummary } from "../../lib/document-config";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";

/**
 * Sets saved on a higher plan, for a plan without them: still listed so the user sees what
 * the account holds and can delete it. Applying and editing stay with the paid plans.
 */
export function LockedPresetList({
  presets,
  isBusy,
  onDelete,
}: {
  presets: readonly PresetSummary[];
  isBusy: boolean;
  onDelete: (preset: PresetSummary) => void;
}) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState<PresetSummary | null>(null);
  if (presets.length === 0) return null;
  return (
    <div data-testid="presets-locked-list" className="space-y-2">
      <p className="text-sm text-content-secondary">
        {t("document.presetsKeptLocked")}
      </p>
      <ul className="divide-y divide-[var(--color-border)]">
        {presets.map((preset) => (
          <li
            key={preset.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="min-w-0 break-words text-sm text-content">
              {preset.name}
            </span>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isBusy}
              aria-label={`${t("document.deletePreset")}: ${preset.name}`}
              onClick={() => setDeleting(preset)}
            >
              {t("common.delete")}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDelete(deleting);
          setDeleting(null);
        }}
        title={t("document.deletePreset")}
        message={t("document.deletePresetConfirm")}
        itemName={deleting?.name}
      />
    </div>
  );
}
