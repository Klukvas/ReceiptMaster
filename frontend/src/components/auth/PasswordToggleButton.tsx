import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

interface PasswordToggleButtonProps {
  isVisible: boolean;
  onToggle: () => void;
}

/**
 * Show/hide control that sits inside a `relative` password field. The 44px box is
 * centred on the same spot the bare 20px icon used to occupy.
 */
export const PasswordToggleButton = ({
  isVisible,
  onToggle,
}: PasswordToggleButtonProps) => {
  const { t } = useTranslation();
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-label={isVisible ? t("auth.hidePassword") : t("auth.showPassword")}
      aria-pressed={isVisible}
      onClick={onToggle}
      className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-content-tertiary hover:text-content-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
};
