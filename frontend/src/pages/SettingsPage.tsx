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
    border: "border-gray-200 dark:border-gray-700",
    bg: "bg-white dark:bg-gray-800",
    badge: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  },
  pro: {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/30 dark:bg-blue-900/10",
    badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
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
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
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
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
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
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">
            {t(
              "subscription.pastDueNotice",
              "Payment failed. Please update your payment method.",
            )}
          </p>
          {hasPaddleSub && (
            <button
              onClick={handleManage}
              className="ml-auto text-sm font-medium text-red-700 dark:text-red-300 underline"
            >
              {t("subscription.billingPortal", "Billing Portal")}
            </button>
          )}
        </div>
      )}

      {/* Current plan + usage */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
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
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
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
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            {t("subscription.nextRenewal", "Next renewal")}:{" "}
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
                isCurrent ? "ring-2 ring-blue-500/30" : ""
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-medium">
                  {t("subscription.currentPlan", "Current Plan")}
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <Crown
                  className={`h-5 w-5 ${
                    plan === "business"
                      ? "text-purple-500"
                      : plan === "pro"
                        ? "text-blue-500"
                        : "text-gray-400"
                  }`}
                />
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {t(`subscription.${plan}`, plan)}
                </h4>
              </div>

              <ul className="space-y-2 mb-4">
                {planFeatures(plan).map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                  >
                    <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
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
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "bg-blue-600 hover:bg-blue-700"
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
            <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {t("settings.title", "Settings")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t(
                "settings.subtitle",
                "System settings and document appearance management",
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700/60">
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
                    ? "bg-white dark:bg-gray-800/80 text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-700/60 border-b-white dark:border-b-gray-800/80 -mb-px"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400"}`}
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700/50 mb-4">
              <Wrench className="h-7 w-7 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.advancedTitle", "Advanced Settings Coming Soon")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
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
