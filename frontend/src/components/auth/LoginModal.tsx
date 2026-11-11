import React, { useRef, useState } from "react";
import { Mail, Lock } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useFieldErrors } from "../../hooks/useFieldErrors";
import { useFocusFirstField } from "../../hooks/useFocusFirstField";
import { useTranslation } from "../../hooks/useTranslation";
import { parseApiError } from "../../lib/api-errors";
import { validateLogin, type AuthField } from "../../lib/auth-validation";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { Modal } from "../ui/Modal";
import { PasswordToggleButton } from "./PasswordToggleButton";
import toast from "react-hot-toast";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToRegister?: () => void;
}

const INPUT_CLASS =
  "w-full pl-10 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base bg-elevated text-content";

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSwitchToRegister,
}) => {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  // Synchronous guard: state updates land after a second click in the same task.
  const inFlight = useRef(false);
  const formRef = useFocusFirstField<HTMLFormElement>(isOpen);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const { errors, clearField, showErrors, messageFor } = useFieldErrors(t);

  const borderFor = (field: AuthField) =>
    errors[field] ? "border-danger-base" : "border-[var(--color-border)]";

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    clearField(name as AuthField);
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (inFlight.current) return;
    if (!showErrors(validateLogin(formData))) return;

    inFlight.current = true;
    setIsLoading(true);
    try {
      await login(formData.email.trim(), formData.password);
      // login() is already loading the dashboard. The dialog stays open and busy until the page
      // unloads, so focus stays on its submit button instead of falling back to the landing page.
      toast.success(t("auth.loginSuccess"));
    } catch (error: unknown) {
      setErrorMessage(parseApiError(error).message);
      inFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ email: "", password: "" });
    showErrors({});
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("auth.loginTitle")}
      size="sm"
    >
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded border border-[var(--color-danger-light)] bg-[var(--color-danger-light)] px-3 py-2 text-sm text-danger-base"
        >
          {errorMessage}
        </div>
      )}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6"
      >
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-content-secondary mb-2"
          >
            {t("auth.email")}
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
            <input
              type="email"
              autoComplete="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={`${INPUT_CLASS} pr-3 ${borderFor("email")}`}
              placeholder={t("auth.email")}
              required
            />
          </div>
          <FieldError id="email-error" message={messageFor("email")} />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-content-secondary mb-2"
          >
            {t("auth.password")}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              className={`${INPUT_CLASS} pr-10 ${borderFor("password")}`}
              placeholder={t("auth.password")}
              required
            />
            <PasswordToggleButton
              isVisible={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
            />
          </div>
          <FieldError id="password-error" message={messageFor("password")} />
        </div>

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? t("common.loading") : t("auth.login")}
        </Button>

        {/* Switch to Register */}
        {onSwitchToRegister && (
          <div className="text-center">
            <p className="text-sm text-content-secondary">
              {t("auth.dontHaveAccount")}{" "}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="font-medium text-accent-base hover:text-accent-base transition-colors"
              >
                {t("auth.signUpHere")}
              </button>
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
};
