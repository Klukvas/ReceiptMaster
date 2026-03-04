import React from "react";
import { Trash2, X } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

interface BulkSelectionBarProps {
 selectedCount: number;
 onDelete: () => void;
 onClear: () => void;
 isDeleting?: boolean;
}

export const BulkSelectionBar: React.FC<BulkSelectionBarProps> = ({
 selectedCount,
 onDelete,
 onClear,
 isDeleting = false,
}) => {
 const { t } = useTranslation();

 if (selectedCount === 0) return null;

 return (
 <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-modal-content">
 <div className="flex items-center gap-3 px-5 py-3 bg-elevated text-content rounded-xl shadow-2xl border border-[var(--color-border)]">
 <span className="text-sm font-medium whitespace-nowrap">
 {selectedCount} {t("products.selected", "selected")}
 </span>

 <div className="w-px h-5 bg-surface-alt" />

 <button
 onClick={onDelete}
 disabled={isDeleting}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-danger-base hover:text-danger-base hover:bg-surface-alt rounded-lg transition-colors duration-150 disabled:opacity-50"
 >
 <Trash2 className="w-3.5 h-3.5" />
 {t("common.delete")}
 </button>

 <button
 onClick={onClear}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-content-tertiary hover:text-content hover:bg-surface-alt rounded-lg transition-colors duration-150"
 >
 <X className="w-3.5 h-3.5" />
 {t("common.clear")}
 </button>
 </div>
 </div>
 );
};
