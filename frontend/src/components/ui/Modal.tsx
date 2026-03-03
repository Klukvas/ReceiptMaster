import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  cn,
} from "@klukvas/flux-b2c-ui";
import { X } from "lucide-react";

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
}) => (
  <Dialog
    open={isOpen}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
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
              aria-label="Close"
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

Modal.displayName = "Modal";
