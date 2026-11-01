import React, { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Link } from "react-router-dom";
import { parseApiError } from "../../lib/api-errors";
import { useTranslation } from "../../hooks/useTranslation";
import { useFieldErrors } from "../../hooks/useFieldErrors";
import { validateLogin, type AuthField } from "../../lib/auth-validation";
import { FieldError } from "../ui/FieldError";
import {
  clearSessionExpired,
  hasSessionExpired,
} from "../../lib/session-expiry";

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSessionExpired] = useState(hasSessionExpired);

  const { login } = useAuth();
  const { t } = useTranslation();
  const { errors, clearField, showErrors, messageFor } = useFieldErrors(t);

  const borderFor = (field: AuthField) =>
    errors[field] ? "border-danger-base" : "border-[var(--color-border)]";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!showErrors(validateLogin({ email, password }))) return;
    setIsLoading(true);

    try {
      await login(email.trim(), password);
      clearSessionExpired();
    } catch (err: unknown) {
      const apiError = parseApiError(err);
      setError(apiError.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-content">
            {t("auth.loginTitle")}
          </h2>
          <p className="mt-2 text-center text-sm text-content-secondary">
            {t("auth.loginSubtitle")}
          </p>
        </div>
        {isSessionExpired && (
          <div
            role="status"
            className="rounded-md border border-[var(--color-border)] bg-elevated px-3 py-2 text-center text-sm text-content-secondary"
          >
            {t("auth.sessionExpired")}
          </div>
        )}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                {t("auth.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={`appearance-none relative block w-full px-3 py-2 border ${borderFor("email")} placeholder-content-tertiary text-content bg-elevated rounded-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base sm:text-sm transition-colors duration-200`}
                placeholder={t("auth.email")}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearField("email");
                  setError("");
                }}
              />
              <FieldError id="email-error" message={messageFor("email")} />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                {t("auth.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                className={`appearance-none relative block w-full px-3 py-2 border ${borderFor("password")} placeholder-content-tertiary text-content bg-elevated rounded-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base sm:text-sm transition-colors duration-200`}
                placeholder={t("auth.password")}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearField("password");
                  setError("");
                }}
              />
              <FieldError
                id="password-error"
                message={messageFor("password")}
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] p-4"
            >
              <div className="text-sm text-danger-base">{error}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-accent-base hover:bg-accent-base-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-ring)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? t("common.loading") : t("auth.login")}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-content-secondary">
              {t("auth.dontHaveAccount")}{" "}
              <Link
                to="/?auth=register"
                className="font-medium text-accent-base hover:text-accent-base-hover transition-colors duration-200"
              >
                {t("auth.signUpHere")}
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
