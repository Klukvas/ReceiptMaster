import React, { useRef, useState } from "react";
import {
  Mail,
  Lock,
  Save,
  Edit3,
  X,
  Crown,
  Package,
  ShoppingCart,
  FileText,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "../components/ui/Button";
import { PasswordToggleButton } from "../components/auth/PasswordToggleButton";
import { useAuth } from "../hooks/useAuth";
import { useTranslation } from "../hooks/useTranslation";
import { useSubscription } from "../hooks/useSubscription";
import { authApi } from "../lib/api";
import toast from "react-hot-toast";
import { parseApiError } from "../lib/api-errors";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, exceedsPasswordBytes } from "../lib/password-policy";
import { PasswordBytesHint } from "../components/auth/PasswordBytesHint";

const SUPPORT_EMAIL = "fluxlab@flux-lab.dev";

export const ProfilePage: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const { status: subscription, isLoading: subLoading } = useSubscription();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Synchronous guard: state updates land after a second click in the same task.
  const inFlight = useRef(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [formData, setFormData] = useState({
    email: user?.email || "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    if (!formData.email.trim()) {
      toast.error(t("profile.fillAllFields"));
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      await authApi.updateProfile(formData);
      await refreshProfile();
      toast.success(t("profile.profileUpdated"));
      setIsEditing(false);
    } catch (error: unknown) {
      toast.error(parseApiError(error).message || t("profile.updateFailed"));
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      email: user?.email || "",
    });
    setIsEditing(false);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleChangePassword = async () => {
    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.confirmPassword
    ) {
      toast.error(t("profile.fillAllFields"));
      return;
    }

    if (passwordData.newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(t("errors.passwordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    if (exceedsPasswordBytes(passwordData.newPassword)) {
      toast.error(t("errors.passwordTooLong", { max: MAX_PASSWORD_BYTES }));
      document.getElementById("newPassword")?.focus();
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t("errors.passwordsDoNotMatch"));
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      await authApi.changePassword(passwordData);
      toast.success(t("profile.passwordChanged"));
      setIsChangingPassword(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: unknown) {
      toast.error(
        parseApiError(error).message || t("profile.passwordChangeFailed"),
      );
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setIsChangingPassword(false);
    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setShowPasswords({ current: false, new: false, confirm: false });
  };

  const initials = user?.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-surface-alt py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-content">
            {t("profile.title")}
          </h1>
          <p className="mt-2 text-content-secondary">{t("profile.subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <div className="bg-elevated rounded-lg shadow-sm border border-[var(--color-border)] p-6">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-surface-alt flex items-center justify-center text-2xl font-medium text-content-secondary">
                  {initials || "🧑"}
                </div>
                <h2 className="text-xl font-semibold text-content">
                  {user?.email}
                </h2>
              </div>

              <div className="mt-6 space-y-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // One form at a time: editing the profile closes the password form.
                    handleCancelPasswordChange();
                    setIsEditing(true);
                  }}
                >
                  <Edit3 className="w-4 h-4" />
                  {t("profile.editProfile")}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    handleCancel();
                    setIsChangingPassword(true);
                  }}
                >
                  <Lock className="w-4 h-4" />
                  {t("profile.changePassword")}
                </Button>
              </div>
            </div>

            {/* Subscription & Limits */}
            <div className="mt-6 bg-elevated rounded-lg shadow-sm border border-[var(--color-border)] p-6">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-warning-base" />
                <h3 className="text-sm font-semibold text-content">
                  {t("profile.subscription", "Subscription")}
                </h3>
              </div>

              {subLoading ? (
                <div className="space-y-3">
                  <div className="h-4 bg-surface-alt rounded animate-pulse" />
                  <div className="h-4 bg-surface-alt rounded animate-pulse w-2/3" />
                </div>
              ) : subscription ? (
                <div className="space-y-4">
                  {/* Plan badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-content-tertiary">
                      {t("profile.currentPlan", "Plan")}
                    </span>
                    <span
                      className={clsx(
                        "text-xs font-semibold px-2 py-0.5 rounded-full",
                        subscription.plan === "free"
                          ? "bg-surface-alt text-content-secondary"
                          : subscription.plan === "pro"
                            ? "bg-[var(--color-accent-light)] text-accent-base"
                            : "bg-[var(--color-warning-light)] text-warning-base",
                      )}
                    >
                      {subscription.plan.toUpperCase()}
                    </span>
                  </div>

                  {/* Products usage */}
                  {subscription.limits.maxProducts !== null && (
                    <LimitRow
                      icon={<Package className="w-3.5 h-3.5" />}
                      label={t("profile.products", "Products")}
                      current={subscription.usage.productsCount}
                      max={subscription.limits.maxProducts}
                    />
                  )}

                  {/* Orders usage */}
                  {subscription.limits.maxOrdersPerMonth !== null && (
                    <LimitRow
                      icon={<ShoppingCart className="w-3.5 h-3.5" />}
                      label={t("profile.ordersPerMonth", "Orders / mo")}
                      current={subscription.usage.ordersThisMonth}
                      max={subscription.limits.maxOrdersPerMonth}
                    />
                  )}

                  {/* Templates */}
                  {subscription.limits.allowedTemplateIds !== null && (
                    <LimitRow
                      icon={<FileText className="w-3.5 h-3.5" />}
                      label={t("profile.templates", "Templates")}
                      current={subscription.limits.allowedTemplateIds.length}
                      max={null}
                    />
                  )}

                  {/* Unlimited indicators for paid plans */}
                  {subscription.limits.maxProducts === null &&
                    subscription.limits.maxOrdersPerMonth === null && (
                      <p className="text-xs text-success-base font-medium">
                        {t("profile.unlimitedAccess", "Unlimited access")}
                      </p>
                    )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Profile Form */}
          <div className="lg:col-span-2">
            <div className="bg-elevated rounded-lg shadow-sm border border-[var(--color-border)]">
              <div className="px-6 py-4 border-b border-[var(--color-border)]">
                <h3 className="text-lg font-medium text-content">
                  {isEditing
                    ? t("profile.editProfile")
                    : t("profile.profileInformation")}
                </h3>
              </div>

              <div className="p-6">
                <form className="space-y-6">
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
                        disabled={!isEditing}
                        className={`w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base ${
                          isEditing
                            ? "border-[var(--color-border)] bg-elevated text-content"
                            : "border-[var(--color-border)] bg-surface-alt text-content-tertiary"
                        }`}
                        placeholder={t("auth.email")}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {isEditing && (
                    <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--color-border)]">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isLoading}
                      >
                        <X className="w-4 h-4" />
                        {t("common.cancel")}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSave}
                        disabled={isLoading}
                      >
                        <Save className="w-4 h-4" />
                        {isLoading ? t("common.loading") : t("common.save")}
                      </Button>
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Change Password Form */}
            {isChangingPassword && (
              <div className="mt-6 bg-elevated rounded-lg shadow-sm border border-[var(--color-border)]">
                <div className="px-6 py-4 border-b border-[var(--color-border)]">
                  <h3 className="text-lg font-medium text-content">
                    {t("profile.changePassword")}
                  </h3>
                </div>
                <div className="p-6">
                  <form
                    className="space-y-6"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleChangePassword();
                    }}
                  >
                    {/* Current Password */}
                    <div>
                      <label
                        htmlFor="currentPassword"
                        className="block text-sm font-medium text-content-secondary mb-2"
                      >
                        {t("profile.currentPassword")}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
                        <input
                          type={showPasswords.current ? "text" : "password"}
                          autoComplete="current-password"
                          id="currentPassword"
                          name="currentPassword"
                          value={passwordData.currentPassword}
                          onChange={handlePasswordChange}
                          className="w-full pl-10 pr-10 py-2 border border-[var(--color-border)] rounded-md shadow-sm bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base"
                          placeholder={t("profile.currentPassword")}
                          required
                        />
                        <PasswordToggleButton
                          isVisible={showPasswords.current}
                          onToggle={() =>
                            setShowPasswords((prev) => ({
                              ...prev,
                              current: !prev.current,
                            }))
                          }
                        />
                      </div>
                    </div>

                    {/* New Password */}
                    <div>
                      <label
                        htmlFor="newPassword"
                        className="block text-sm font-medium text-content-secondary mb-2"
                      >
                        {t("profile.newPassword")}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
                        <input
                          type={showPasswords.new ? "text" : "password"}
                          autoComplete="new-password"
                          id="newPassword"
                          name="newPassword"
                          aria-describedby="new-password-rule"
                          aria-invalid={exceedsPasswordBytes(passwordData.newPassword) || undefined}
                          value={passwordData.newPassword}
                          onChange={handlePasswordChange}
                          className="w-full pl-10 pr-10 py-2 border border-[var(--color-border)] rounded-md shadow-sm bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base"
                          placeholder={t("profile.newPassword")}
                          minLength={MIN_PASSWORD_LENGTH}
                          required
                        />
                        <PasswordToggleButton
                          isVisible={showPasswords.new}
                          onToggle={() =>
                            setShowPasswords((prev) => ({
                              ...prev,
                              new: !prev.new,
                            }))
                          }
                        />
                      </div>
                      <PasswordBytesHint
                        id="new-password-rule"
                        password={passwordData.newPassword}
                        className="text-content-tertiary"
                      />
                    </div>

                    {/* Confirm Password */}
                    <div>
                      <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium text-content-secondary mb-2"
                      >
                        {t("profile.confirmPassword")}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
                        <input
                          type={showPasswords.confirm ? "text" : "password"}
                          autoComplete="new-password"
                          id="confirmPassword"
                          name="confirmPassword"
                          value={passwordData.confirmPassword}
                          onChange={handlePasswordChange}
                          className="w-full pl-10 pr-10 py-2 border border-[var(--color-border)] rounded-md shadow-sm bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base"
                          placeholder={t("profile.confirmPassword")}
                          minLength={MIN_PASSWORD_LENGTH}
                          required
                        />
                        <PasswordToggleButton
                          isVisible={showPasswords.confirm}
                          onToggle={() =>
                            setShowPasswords((prev) => ({
                              ...prev,
                              confirm: !prev.confirm,
                            }))
                          }
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--color-border)]">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelPasswordChange}
                        disabled={isLoading}
                      >
                        <X className="w-4 h-4" />
                        {t("common.cancel")}
                      </Button>
                      <Button type="submit" disabled={isLoading}>
                        <Lock className="w-4 h-4" />
                        {isLoading
                          ? t("common.loading")
                          : t("profile.changePassword")}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Account Actions */}
            <div className="mt-6 bg-elevated rounded-lg shadow-sm border border-[var(--color-border)]">
              <div className="px-6 py-4 border-b border-[var(--color-border)]">
                <h3 className="text-lg font-medium text-content">
                  {t("profile.accountActions")}
                </h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-[var(--color-border)] rounded-lg">
                    <div>
                      <h4 className="text-sm font-medium text-content">
                        {t("profile.deleteAccount")}
                      </h4>
                      <p className="text-sm text-content-secondary mt-1">
                        {t("profile.deleteAccountDescription")}
                      </p>
                    </div>
                    {/* Self-service deletion does not exist yet; the privacy policy promises a reply within 30 days. */}
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("profile.deleteAccountEmailSubject"))}`}
                      className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2 border border-[var(--color-danger-light)] rounded-md shadow-sm text-sm font-medium text-danger-base bg-elevated hover:bg-[var(--color-danger-light)] transition-colors shrink-0 text-center pointer-coarse:min-h-11"
                    >
                      {t("profile.requestAccountDeletion")}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LimitRow = ({
  icon,
  label,
  current,
  max,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  max: number | null;
}) => {
  const percentage = max !== null ? Math.min((current / max) * 100, 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-content-tertiary">
          {icon}
          {label}
        </div>
        <span
          className={clsx(
            "text-xs font-medium",
            max === null
              ? "text-content-secondary"
              : percentage >= 100
                ? "text-danger-base"
                : percentage >= 80
                  ? "text-warning-base"
                  : "text-content-secondary",
          )}
        >
          {max !== null ? `${current}/${max}` : current}
        </span>
      </div>
      {max !== null && (
        <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all duration-300 motion-reduce:transition-none",
              percentage >= 100
                ? "bg-danger-base"
                : percentage >= 80
                  ? "bg-warning-base"
                  : "bg-success-base",
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
};
