import React, { useState } from "react";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useFieldErrors } from "../../hooks/useFieldErrors";
import { useTranslation } from "../../hooks/useTranslation";
import { ErrorCode, parseApiError } from "../../lib/api-errors";
import { validateRegister, type AuthField } from "../../lib/auth-validation";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { Modal } from "../ui/Modal";
import toast from "react-hot-toast";
import { MIN_PASSWORD_LENGTH } from "../../lib/password-policy";

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin?: () => void;
}

const EMPTY_FORM = { email: "", password: "", confirmPassword: "" };

const INPUT_CLASS =
  "w-full pl-10 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base bg-elevated text-content";

export const RegisterModal: React.FC<RegisterModalProps> = ({
  isOpen,
  onClose,
  onSwitchToLogin,
}) => {
  const { register } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
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
    // Editing the password changes whether the confirmation still matches.
    if (name === "password") clearField("confirmPassword");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!showErrors(validateRegister(formData))) return;

    setIsLoading(true);
    try {
      await register(formData.email.trim(), formData.password, "", "");
      toast.success(t("auth.registerSuccess"));
      onClose();
      setFormData(EMPTY_FORM);
    } catch (error: unknown) {
      const { code, message } = parseApiError(error);
      if (code === ErrorCode.USER_ALREADY_EXISTS) {
        showErrors({ email: "emailTaken" });
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(EMPTY_FORM);
    showErrors({});
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("auth.registerTitle")}
      size="sm"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
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
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password
                  ? "password-error password-rule"
                  : "password-rule"
              }
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className={`${INPUT_CLASS} pr-10 ${borderFor("password")}`}
              placeholder={t("auth.password")}
              required
            />
            <button
              type="button"
              aria-label={
                showPassword ? t("auth.hidePassword") : t("auth.showPassword")
              }
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          <FieldError id="password-error" message={messageFor("password")} />
          <p id="password-rule" className="mt-1 text-xs text-content-secondary">
            {t("auth.passwordRule", { min: MIN_PASSWORD_LENGTH })}
          </p>
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-content-secondary mb-2"
          >
            {t("auth.confirmPassword")}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
            <input
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              aria-invalid={errors.confirmPassword ? true : undefined}
              aria-describedby={
                errors.confirmPassword ? "confirmPassword-error" : undefined
              }
              className={`${INPUT_CLASS} pr-10 ${borderFor("confirmPassword")}`}
              placeholder={t("auth.confirmPassword")}
              required
            />
            <button
              type="button"
              aria-label={
                showConfirmPassword
                  ? t("auth.hidePassword")
                  : t("auth.showPassword")
              }
              aria-pressed={showConfirmPassword}
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          <FieldError
            id="confirmPassword-error"
            message={messageFor("confirmPassword")}
          />
        </div>

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? t("common.loading") : t("auth.register")}
        </Button>

        {/* Switch to Login */}
        {onSwitchToLogin && (
          <div className="text-center">
            <p className="text-sm text-content-secondary">
              {t("auth.alreadyHaveAccount")}{" "}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="font-medium text-accent-base hover:text-accent-base transition-colors"
              >
                {t("auth.signInHere")}
              </button>
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
};
