import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./primitives/dialog";
import { cn } from "./primitives/cn";
import { X } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  showCloseButton?: boolean;
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  showCloseButton = true,
}) => {
  const { t } = useTranslation();
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      // Dialog's wrapper defaults to max-w-lg, so the size has to be set there too or
      // "lg"/"xl" modals stay 512px wide and squeeze their content.
      className={sizeClasses[size]}
    >
      <DialogContent
        className={cn(
          "rounded-xl border-[var(--color-border)] bg-[var(--color-elevated)] p-0 shadow-xl animate-modal-content",
          sizeClasses[size],
        )}
      >
        {(title || showCloseButton) && (
          <DialogHeader className="flex-row items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            {title && <DialogTitle className="text-lg">{title}</DialogTitle>}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </DialogHeader>
        )}
        <div className="px-6 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
};

Modal.displayName = "Modal";
