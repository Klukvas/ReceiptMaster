import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { useTranslation } from "../../hooks/useTranslation";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
}

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  variant = "danger",
  isLoading = false,
}: ConfirmModalProps) => {
  const { t } = useTranslation();

  const iconColors = {
    danger: "bg-[var(--color-danger-light)] text-danger-base",
    warning: "bg-[var(--color-warning-light)] text-warning-base",
    default: "bg-[var(--color-accent-light)] text-accent-base",
  };

  const buttonVariant = variant === "danger" ? "danger" : "primary";
  const defaultLabel =
    variant === "danger" ? t("common.delete") : t("common.confirm");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex gap-4">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${iconColors[variant]}`}
        >
          <AlertTriangle className="w-5 h-5" aria-hidden />
        </div>
        <p className="text-sm text-content-secondary pt-2">{message}</p>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          {t("common.cancel")}
        </Button>
        <Button
          variant={buttonVariant}
          onClick={onConfirm}
          disabled={isLoading}
          className={
            buttonVariant === "danger"
              ? "border border-danger-base"
              : "border border-accent-base"
          }
        >
          {confirmLabel ?? defaultLabel}
        </Button>
      </div>
    </Modal>
  );
};
