import React from "react";
import {
  BarChart3,
  CreditCard,
  Crown,
  Check,
  Download,
  FileStack,
  FileText,
  Hash,
  History,
  ImageIcon,
  Loader2,
  Package,
  Palette,
  PenLine,
  Save,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useTranslation } from "../../hooks/useTranslation";
import { useSubscription } from "../../hooks/useSubscription";
import { useCheckout } from "../../hooks/useCheckout";
import { hasLiveSubscription } from "../../lib/subscriptionApi";
import {
  planDisplayName,
  planHeadline,
  planMonthlyPrice,
  plansOfferedFor,
  type PaidPlan,
  type UpgradeReason,
} from "../../lib/plan-catalog";

export type { UpgradeReason };

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: UpgradeReason;
  /** The locked template, for the "templates" reason: it decides which plans are offered. */
  templateId?: string;
}

const REASON_ICONS: Record<UpgradeReason, LucideIcon> = {
  products: Package,
  orders: ShoppingCart,
  recipients: Users,
  presets: Save,
  templates: Palette,
  documentTypes: FileText,
  retention: FileStack,
  analyticsHistory: History,
  analytics: BarChart3,
  profit: TrendingUp,
  csvExport: Download,
  logo: ImageIcon,
  signoff: PenLine,
  customNumbering: Hash,
  autoReceipt: Zap,
  suppliers: Truck,
  stockInsights: Warehouse,
};

const PLAN_BUTTON_STYLES: Record<PaidPlan, { card: string; icon: string }> = {
  pro: {
    card: "border-[var(--color-accent-light)] bg-[var(--color-accent-light)] hover:border-accent-base",
    icon: "text-accent-base",
  },
  business: {
    card: "border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 hover:border-purple-400 dark:hover:border-purple-600",
    icon: "text-purple-600 dark:text-purple-400",
  },
};

const PlanOfferButton = ({
  plan,
  loading,
  onUpgrade,
}: {
  plan: PaidPlan;
  loading: string | null;
  onUpgrade: (plan: PaidPlan) => void;
}) => {
  const { t } = useTranslation();
  const styles = PLAN_BUTTON_STYLES[plan];
  return (
    <button
      type="button"
      onClick={() => onUpgrade(plan)}
      disabled={!!loading}
      className={clsx(
        "w-full flex items-center justify-between gap-3 p-4 pointer-coarse:min-h-11 rounded-lg border-2 transition-colors",
        styles.card,
      )}
    >
      <div className="flex items-center gap-3">
        <Crown className={clsx("h-5 w-5 shrink-0", styles.icon)} />
        <div className="text-left">
          <div className="font-medium text-content">
            {t("subscription.upgradeTo", { plan: planDisplayName(t, plan) })}
            <span className="ml-2 text-sm font-normal text-content-secondary">
              {planMonthlyPrice(plan)}
              {t("subscription.perMonth")}
            </span>
          </div>
          <div className="text-sm text-content-tertiary">
            {planHeadline(t, plan)}
          </div>
        </div>
      </div>
      {loading === plan ? (
        <Loader2 className={clsx("h-4 w-4 animate-spin", styles.icon)} />
      ) : (
        <CreditCard className={clsx("h-4 w-4 shrink-0", styles.icon)} />
      )}
    </button>
  );
};

const SUBSCRIPTION_TAB_PATH = "/settings?tab=subscription";

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  reason,
  templateId,
}) => {
  const { t } = useTranslation();
  const { status } = useSubscription();
  const { loading, handleUpgrade, billingEnabled } = useCheckout();
  const navigate = useNavigate();

  const Icon = REASON_ICONS[reason];
  const title = t(`subscription.reasons.${reason}.title`);
  const description = t(`subscription.reasons.${reason}.description`);
  // Nothing is sold on a guess: an unknown status (loading or failed) could belong to a
  // paying account, so it gets the explanation only, as with billing switched off.
  const offeredPlans = status
    ? plansOfferedFor(reason, status.plan, templateId)
    : [];

  if (!billingEnabled || !status)
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        size="md"
        showCloseButton={false}
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="mb-4">
            <Icon className="h-12 w-12 text-warning-base" />
          </div>
          <p className="text-content-secondary mb-6">
            {description}{" "}
            {t(
              billingEnabled
                ? "subscription.statusUnknown"
                : "subscription.upgradesUnavailable",
            )}
          </p>
          <Button onClick={onClose}>{t("common.close", "Close")}</Button>
        </div>
      </Modal>
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      showCloseButton={false}
    >
      <div className="flex flex-col items-center text-center py-4">
        <div className="mb-4 p-3 bg-[var(--color-warning-light)] rounded-full">
          <Icon className="h-12 w-12 text-warning-base" />
        </div>

        <p className="text-content-secondary mb-6">{description}</p>

        {hasLiveSubscription(status) ? (
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              navigate(SUBSCRIPTION_TAB_PATH);
            }}
            className="w-full"
          >
            {t("subscription.openPlans")}
          </Button>
        ) : offeredPlans.length > 0 ? (
          <div className="w-full space-y-3">
            {offeredPlans.map((plan) => (
              <PlanOfferButton
                key={plan}
                plan={plan}
                loading={loading}
                onUpgrade={handleUpgrade}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-success-base py-2">
            <Check className="h-5 w-5" />
            <span className="font-medium">
              {t("subscription.alreadyTopPlan", "You're on the top plan!")}
            </span>
          </div>
        )}

        <Button variant="ghost" onClick={onClose} className="mt-4">
          {t("common.close", "Close")}
        </Button>
      </div>
    </Modal>
  );
};
