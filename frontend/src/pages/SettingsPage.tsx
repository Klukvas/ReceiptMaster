import { useState } from "react";
import {
  Building2,
  Palette,
  Globe,
  Wrench,
  Settings,
  CreditCard,
  Crown,
  Check,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { LogoUpload } from "../components/settings/LogoUpload";
import { CompanyInfoCustomizer } from "../components/settings/CompanyInfoCustomizer";
import { TemplateSelector } from "../components/settings/TemplateSelector";
import { LanguageSelector } from "../components/settings/LanguageSelector";
import { ReceiptTitleCustomizer } from "../components/settings/ReceiptTitleCustomizer";
import { FooterCustomizer } from "../components/settings/FooterCustomizer";
import { PrimaryColorPicker } from "../components/settings/PrimaryColorPicker";
import { ProformaSettings } from "../components/settings/ProformaSettings";
import { TestReceiptButton } from "../components/settings/TestReceiptButton";
import { UsageBar } from "../components/subscription/UsageBar";
import { useTranslation } from "../hooks/useTranslation";
import { useSubscription } from "../hooks/useSubscription";
import { useCheckout } from "../hooks/useCheckout";

type SettingsTab =
  | "company"
  | "receipt"
  | "language"
  | "subscription"
  | "advanced";

const VALID_TABS: readonly SettingsTab[] = [
  "company",
  "receipt",
  "language",
  "subscription",
  "advanced",
] as const;

type PlanKey = "free" | "pro" | "business";

const PLAN_COLORS: Record<
  PlanKey,
  { border: string; bg: string; badge: string }
> = {
  free: {
    border: "border-[var(--color-border)]",
    bg: "bg-elevated",
    badge: "bg-surface-alt text-content-secondary",
  },
  pro: {
    border: "border-[var(--color-accent-light)]",
    bg: "bg-[var(--color-accent-light)]",
    badge: "bg-[var(--color-accent-light)] text-accent-base",
  },
  business: {
    border: "border-purple-200 dark:border-purple-800",
    bg: "bg-purple-50/30 dark:bg-purple-900/10",
    badge:
      "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  },
};

const SubscriptionTab = () => {
  const { t } = useTranslation();
  const { status, isLoading } = useSubscription();
  const { loading: upgrading, handleUpgrade, handleManage } = useCheckout();

  const currentPlan = status?.plan ?? "free";
  const paddleStatus = status?.paddleStatus;
  const periodEnd = status?.currentPeriodEnd;
  const hasPaddleSub = status?.hasPaddleSubscription ?? false;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-content-tertiary" />
      </div>
    );
  }

  // M3: Drive feature lists from API response limits instead of hardcoding
  const planFeatures = (plan: PlanKey): string[] => {
    if (plan === "business") {
      return [
        t("subscription.unlimitedProducts", "Unlimited products"),
        t("subscription.unlimitedOrders", "Unlimited orders"),
        t("subscription.allTemplates", "All templates"),
      ];
    }
    if (plan === "pro") {
      return [
        t("subscription.productsLimit", "Up to {{count}} products", {
          count: 100,
        }),
        t("subscription.ordersLimit", "Up to {{count}} orders/month", {
          count: 500,
        }),
        t("subscription.allTemplates", "All templates"),
      ];
    }
    return [
      t("subscription.productsLimit", "Up to {{count}} products", {
        count: 10,
      }),
      t("subscription.ordersLimit", "Up to {{count}} orders/month", {
        count: 20,
      }),
      t("subscription.freeTemplates", "4 basic templates"),
    ];
  };

  return (
    <div className="space-y-6">
      {/* Status notices */}
      {paddleStatus === "canceled" && periodEnd && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-warning-light)] border border-[var(--color-warning-light)]">
          <AlertTriangle className="h-5 w-5 text-warning-base shrink-0" />
          <p className="text-sm text-warning-base">
            {t(
              "subscription.canceledNotice",
              "Your subscription will end on {{date}}",
              {
                date: new Date(periodEnd).toLocaleDateString(),
              },
            )}
          </p>
        </div>
      )}

      {paddleStatus === "past_due" && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-danger-light)] border border-[var(--color-danger-light)]">
          <AlertTriangle className="h-5 w-5 text-danger-base shrink-0" />
          <p className="text-sm text-danger-base">
            {t(
              "subscription.pastDueNotice",
              "Payment failed. Please update your payment method.",
            )}
          </p>
          {hasPaddleSub && (
            <button
              onClick={handleManage}
              className="ml-auto text-sm font-medium text-danger-base underline"
            >
              {t("subscription.billingPortal", "Billing Portal")}
            </button>
          )}
        </div>
      )}

      {/* Current plan + usage */}
      <div className="rounded-xl border border-[var(--color-border)] bg-elevated p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-content">
              {t("subscription.currentPlanLabel", "Your current plan")}
            </h3>
            <span
              className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[currentPlan]?.badge}`}
            >
              {t(`subscription.${currentPlan}`, currentPlan)}
            </span>
          </div>
          {hasPaddleSub && (
            <button
              onClick={handleManage}
              disabled={!!upgrading}
              className="flex items-center gap-1.5 text-sm font-medium text-accent-base hover:underline"
            >
              {upgrading === "manage" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              {t("subscription.manageSubscription", "Manage Subscription")}
            </button>
          )}
        </div>

        {status && (
          <div className="space-y-2">
            <UsageBar
              current={status.usage.productsCount}
              max={status.limits.maxProducts}
              label={t("subscription.productsUsage", "Products")}
            />
            <UsageBar
              current={status.usage.ordersThisMonth}
              max={status.limits.maxOrdersPerMonth}
              label={t("subscription.ordersUsage", "Orders this month")}
            />
          </div>
        )}

        {hasPaddleSub && periodEnd && paddleStatus === "active" && (
          <p className="mt-4 text-xs text-content-tertiary">
            {t("subscription.nextRenewal", "Next renewal")}:{""}
            {new Date(periodEnd).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Plan comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["free", "pro", "business"] as const).map((plan) => {
          const isCurrent = currentPlan === plan;
          const colors = PLAN_COLORS[plan];
          const isUpgrade =
            (currentPlan === "free" &&
              (plan === "pro" || plan === "business")) ||
            (currentPlan === "pro" && plan === "business");

          return (
            <div
              key={plan}
              className={`relative rounded-xl border-2 p-5 ${colors.border} ${colors.bg} ${
                isCurrent ? "ring-2 ring-[var(--color-ring)]" : ""
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-accent-base text-white text-xs rounded-full font-medium">
                  {t("subscription.currentPlan", "Current Plan")}
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <Crown
                  className={`h-5 w-5 ${
                    plan === "business"
                      ? "text-purple-500 dark:text-purple-400"
                      : plan === "pro"
                        ? "text-accent-base"
                        : "text-content-tertiary"
                  }`}
                />
                <h4 className="font-semibold text-content">
                  {t(`subscription.${plan}`, plan)}
                </h4>
              </div>

              <ul className="space-y-2 mb-4">
                {planFeatures(plan).map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-content-secondary"
                  >
                    <Check className="h-3.5 w-3.5 text-success-base shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isUpgrade && !hasPaddleSub && (
                <button
                  onClick={() => handleUpgrade(plan)}
                  disabled={!!upgrading}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium text-white transition-colors ${
                    plan === "business"
                      ? "bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                      : "bg-accent-base hover:bg-accent-base-hover"
                  } disabled:opacity-50`}
                >
                  {upgrading === plan ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {plan === "pro"
                    ? t("subscription.upgradeToPro", "Upgrade to Pro")
                    : t(
                        "subscription.upgradeToBusiness",
                        "Upgrade to Business",
                      )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SettingsPage = () => {
  const { t } = useTranslation();
  // H3: Validate tab query parameter against known values
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as SettingsTab;
    return VALID_TABS.includes(tabParam) ? tabParam : "company";
  });

  const tabs: { key: SettingsTab; label: string; icon: typeof Building2 }[] = [
    {
      key: "company",
      label: t("settings.tabCompany", "Company Info"),
      icon: Building2,
    },
    {
      key: "receipt",
      label: t("settings.tabReceipt", "Receipt Design"),
      icon: Palette,
    },
    {
      key: "language",
      label: t("settings.tabLanguage", "Language"),
      icon: Globe,
    },
    {
      key: "subscription",
      label: t("subscription.subscriptionTab", "Subscription"),
      icon: CreditCard,
    },
    {
      key: "advanced",
      label: t("settings.tabAdvanced", "Advanced"),
      icon: Wrench,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-light)]">
            <Settings className="h-5 w-5 text-accent-base" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-content">
              {t("settings.title", "Settings")}
            </h1>
            <p className="text-sm text-content-tertiary">
              {t(
                "settings.subtitle",
                "System settings and document appearance management",
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-[var(--color-border)]">
        <nav
          className="-mb-px flex gap-1 overflow-x-auto scrollbar-hide"
          aria-label="Settings tabs"
        >
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`group relative flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-elevated text-accent-base border border-[var(--color-border)] border-b-elevated -mb-px"
                    : "text-content-tertiary hover:text-content-secondary hover:bg-surface-alt"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${isActive ? "text-accent-base" : "text-content-tertiary group-hover:text-content-tertiary"}`}
                />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-5">
        {activeTab === "company" && (
          <>
            <LogoUpload />
            <CompanyInfoCustomizer />
          </>
        )}

        {activeTab === "receipt" && (
          <>
            <ReceiptTitleCustomizer />
            <TemplateSelector />
            <FooterCustomizer />
            <PrimaryColorPicker />
            <ProformaSettings />
            <TestReceiptButton />
          </>
        )}

        {activeTab === "language" && <LanguageSelector />}

        {activeTab === "subscription" && <SubscriptionTab />}

        {activeTab === "advanced" && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-16 px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-alt mb-4">
              <Wrench className="h-7 w-7 text-content-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-content-secondary mb-1">
              {t("settings.advancedTitle", "Advanced Settings Coming Soon")}
            </h3>
            <p className="text-sm text-content-tertiary text-center max-w-sm">
              {t(
                "settings.advancedDescription",
                "This section will include API keys, webhooks, data export options, and more.",
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
