import React, { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { useIsDesktop } from "../../hooks/useIsDesktop";

interface BulkSelectionBarProps {
 selectedCount: number;
 onDelete: () => void;
 onClear: () => void;
 isDeleting?: boolean;
}

/** Width the desktop sidebar takes from the left edge (it collapses and animates). */
function useSidebarInset(): number {
 const isDesktop = useIsDesktop();
 const [inset, setInset] = useState(0);

 useEffect(() => {
 const sidebar = document.getElementById("app-sidebar");
 if (!isDesktop || !sidebar) {
 setInset(0);
 return;
 }
 const measure = () => setInset(Math.round(sidebar.getBoundingClientRect().right));
 measure();
 if (typeof ResizeObserver !== "function") return;
 const observer = new ResizeObserver(measure);
 observer.observe(sidebar);
 return () => observer.disconnect();
 }, [isDesktop]);

 return inset;
}

export const BulkSelectionBar: React.FC<BulkSelectionBarProps> = ({
 selectedCount,
 onDelete,
 onClear,
 isDeleting = false,
}) => {
 const { t } = useTranslation();
 const sidebarInset = useSidebarInset();

 if (selectedCount === 0) return null;

 return (
 <div
 role="status"
 style={{ left: `calc(50% + ${sidebarInset / 2}px)` }}
 className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] -translate-x-1/2 z-40 animate-modal-content motion-reduce:animate-none max-w-[calc(100%-2rem)]"
 >
 <div className="flex items-center gap-3 px-5 py-3 bg-elevated text-content rounded-xl shadow-2xl border border-[var(--color-border)]">
 <span className="text-sm font-medium whitespace-nowrap tabular-nums">
 {selectedCount} {t("products.selected", "selected")}
 </span>

 <div className="w-px h-5 bg-surface-alt" />

 <button
 onClick={onDelete}
 disabled={isDeleting}
 className="flex items-center gap-1.5 px-3 py-1.5 pointer-coarse:min-h-11 text-sm font-medium text-danger-base hover:text-danger-base hover:bg-surface-alt rounded-lg transition-colors duration-150 disabled:opacity-50"
 >
 <Trash2 className="w-3.5 h-3.5" />
 {t("common.delete")}
 </button>

 <button
 onClick={onClear}
 className="flex items-center gap-1.5 px-3 py-1.5 pointer-coarse:min-h-11 text-sm font-medium text-content-tertiary hover:text-content hover:bg-surface-alt rounded-lg transition-colors duration-150"
 >
 <X className="w-3.5 h-3.5" />
 {t("common.clear")}
 </button>
 </div>
 </div>
 );
};
