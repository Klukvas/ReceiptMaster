import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  Palette,
  Wrench,
  Settings,
  CreditCard,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { AutoReceiptSetting } from "../components/settings/AutoReceiptSetting";
import { DocumentsTab } from "../components/settings/DocumentsTab";
import { tabAfterKey } from "../lib/tab-keys";
import {
  DOCUMENTS_SECTIONS,
  type DocumentsSection,
} from "../components/settings/document-layout";
import { useDocumentDraft } from "../hooks/useDocumentDraft";
import { formatDateOnly } from "../lib/api";
import { Button } from "../components/ui/Button";
import { UsageBar } from "../components/subscription/UsageBar";
import { useTranslation } from "../hooks/useTranslation";
import { useSubscription } from "../hooks/useSubscription";
import { useCheckout } from "../hooks/useCheckout";
import { useSubscriptionRefreshOnOpen } from "../hooks/useSubscriptionRefresh";
import {
  canCancelSubscription,
  canResumeSubscription,
} from "../lib/subscriptionApi";
import { isHigherPlan, planDisplayName } from "../lib/plan-catalog";
import { useSubscriptionActions } from "../hooks/useSubscriptionActions";
import { PlanCards } from "../components/subscription/PlanCards";
import { PLAN_COLORS } from "../components/subscription/plan-colors";
import {
  SubscriptionChangeConfirm,
  type SubscriptionIntent,
} from "../components/subscription/SubscriptionChangeConfirm";
import { PlanLimitsSummary } from "../components/subscription/PlanLimitsSummary";

type SettingsTab = "documents" | "subscription" | "advanced";

const VALID_TABS: readonly SettingsTab[] = [
  "documents",
  "subscription",
  "advanced",
] as const;

// The three document tabs became sub-tabs of Documents; old links (e.g. a requisites
// link to ?tab=company&highlight=…) land on the matching sub-tab.
const LEGACY_TAB_ALIASES: Readonly<Record<string, DocumentsSection>> = {
  company: "company",
  receipt: "design",
  language: "design",
};

// Own keys only: the URL is user input, and "?tab=constructor" must not reach the prototype.
const legacySectionOf = (tab: string): DocumentsSection | undefined =>
  Object.hasOwn(LEGACY_TAB_ALIASES, tab) ? LEGACY_TAB_ALIASES[tab] : undefined;

const isDocumentsSection = (value: string): value is DocumentsSection =>
  (DOCUMENTS_SECTIONS as readonly string[]).includes(value);

const SubscriptionTab = ({ isLandingTab }: { isLandingTab: boolean }) => {
  const { t } = useTranslation();
  const { status, isLoading, isError, refetch } = useSubscription();
  const {
    loading: upgrading,
    handleUpgrade,
    handleManage,
    billingEnabled,
  } = useCheckout();
  // Without billing there is no checkout or portal to come back from.
  useSubscriptionRefreshOnOpen(isLandingTab && billingEnabled);

  const currentPlan = status?.plan ?? "free";
  const billingStatus = status?.billingStatus;
  const periodEnd = status?.currentPeriodEnd;
  const hasBillingSub = status?.hasBillingSubscription ?? false;
  const actions = useSubscriptionActions();
  const [intent, setIntent] = useState<SubscriptionIntent | null>(null);
  const busy = upgrading ?? actions.pending;

  const confirmIntent = async () => {
    if (!intent) return;
    const isDone =
      intent === "cancel"
        ? await actions.cancel()
        : await actions.changePlan(intent, {
            isUpgrade: isHigherPlan(intent, currentPlan),
          });
    // A failed attempt keeps the dialog open so it can be retried.
    if (isDone) setIntent(null);
  };
  // Creem reports a cancellation at period end as scheduled_cancel until it takes effect.
  const isEnding =
    billingStatus === "canceled" || billingStatus === "scheduled_cancel";

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-content-tertiary" />
      </div>
    );
  }

  // A failed status request must not pose as the Free plan: a paying user would see
  // Free and Upgrade buttons.
  if (isError && !status) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-[var(--color-border)] p-4 space-y-3"
      >
        <p className="text-sm text-content">
          {t(
            "subscription.loadFailed",
            "Could not load your subscription. Your plan and usage are unknown until you retry.",
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
        >
          {t("common.retry", "Retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!billingEnabled && (
        <p role="status" className="text-sm text-content-secondary">
          {t(
            "subscription.billingDisabled",
            "Payments are currently unavailable. Your current plan and usage limits still apply.",
          )}
        </p>
      )}
      {/* Status notices */}
      {billingEnabled && isEnding && periodEnd && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-warning-light)] border border-[var(--color-warning-light)]">
          <AlertTriangle className="h-5 w-5 text-warning-base shrink-0" />
          <p className="text-sm text-warning-base">
            {t(
              "subscription.canceledNotice",
              "Your subscription will end on {{date}}",
              {
                date: formatDateOnly(periodEnd),
              },
            )}
          </p>
          {canResumeSubscription(status) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => void actions.resume()}
              disabled={!!busy}
            >
              {actions.pending === "resume" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              )}
              {t("subscription.resumeSubscription")}
            </Button>
          )}
        </div>
      )}

      {billingEnabled && billingStatus === "past_due" && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-danger-light)] border border-[var(--color-danger-light)]">
          <AlertTriangle className="h-5 w-5 text-danger-base shrink-0" />
          <p className="text-sm text-danger-base">
            {t(
              "subscription.pastDueNotice",
              "Payment failed. Please update your payment method.",
            )}
          </p>
          {billingEnabled && hasBillingSub && (
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-content">
              {t("subscription.currentPlanLabel", "Your current plan")}
            </h2>
            <span
              className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[currentPlan]?.badge}`}
            >
              {planDisplayName(t, currentPlan)}
            </span>
          </div>
          {billingEnabled && canCancelSubscription(status) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIntent("cancel")}
              disabled={!!busy}
            >
              {t("subscription.cancelSubscription")}
            </Button>
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
            <UsageBar
              current={status.usage.recipientsCount}
              max={status.limits.maxRecipients}
              label={t("subscription.recipientsUsage")}
            />
          </div>
        )}

        {status && <PlanLimitsSummary limits={status.limits} />}

        {billingEnabled &&
          hasBillingSub &&
          periodEnd &&
          billingStatus === "active" && (
            <p className="mt-4 text-xs text-content-tertiary">
              {t("subscription.nextRenewal", "Next renewal")}:{" "}
              {formatDateOnly(periodEnd)}
            </p>
          )}
      </div>

      {/* Plan comparison */}
      {billingEnabled && (
        <PlanCards
          status={status}
          busy={busy}
          onCheckout={(plan) => void handleUpgrade(plan)}
          onSwitch={setIntent}
          onCancel={() => setIntent("cancel")}
        />
      )}
      <SubscriptionChangeConfirm
        intent={intent}
        status={status}
        isLoading={actions.pending !== null}
        onConfirm={() => void confirmIntent()}
        onClose={() => setIntent(null)}
      />
    </div>
  );
};

export const SettingsPage = () => {
  const documentDraft = useDocumentDraft();
  const { t } = useTranslation();
  // H3: Validate tab query parameter against known values
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const legacySection = legacySectionOf(tabParam);
  const aliasedTab = legacySection ? "documents" : (tabParam as SettingsTab);
  const activeTab: SettingsTab = VALID_TABS.includes(aliasedTab)
    ? aliasedTab
    : "documents";
  const sectionParam = searchParams.get("section") ?? "";
  // Another tab's URL has no section, so the sub-tab last open is kept here for the way back.
  const [lastSection, setLastSection] = useState<DocumentsSection>("company");
  const documentsSection: DocumentsSection = isDocumentsSection(sectionParam)
    ? sectionParam
    : (legacySection ?? lastSection);
  if (activeTab === "documents" && documentsSection !== lastSection)
    setLastSection(documentsSection);
  // Written back to the URL so reload keeps the tab; replace keeps Back from stepping
  // through every tab the user clicked.
  const setActiveTab = (tab: SettingsTab) =>
    setSearchParams(
      tab === "documents" ? { tab, section: documentsSection } : { tab },
      { replace: true },
    );
  const setDocumentsSection = (section: DocumentsSection) =>
    setSearchParams({ tab: "documents", section }, { replace: true });

  // The provider's return link opens the page on this tab; a click on the tab does not count.
  const [isLandedOnSubscription] = useState(activeTab === "subscription");

  const tabListRef = useRef<HTMLDivElement>(null);
  const [hasHiddenTabs, setHasHiddenTabs] = useState(false);

  const updateHiddenTabs = useCallback(() => {
    const list = tabListRef.current;
    if (!list) return;
    setHasHiddenTabs(list.scrollLeft + list.clientWidth < list.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const list = tabListRef.current;
    updateHiddenTabs();
    list?.addEventListener("scroll", updateHiddenTabs, { passive: true });
    window.addEventListener("resize", updateHiddenTabs);
    return () => {
      list?.removeEventListener("scroll", updateHiddenTabs);
      window.removeEventListener("resize", updateHiddenTabs);
    };
  }, [updateHiddenTabs]);

  // Keep the selected tab visible, e.g. when opened through ?tab=advanced on a phone.
  useEffect(() => {
    document
      .getElementById(`settings-tab-${activeTab}`)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  const tabs: { key: SettingsTab; label: string; icon: typeof Building2 }[] = [
    {
      key: "documents",
      label: t("settings.tabDocuments", "Documents"),
      icon: Palette,
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

  // Roving tabindex: arrows, Home and End move between tabs, as in the ARIA tabs pattern.
  const handleTabKeyDown = (event: React.KeyboardEvent) => {
    const target = tabAfterKey(
      event.key,
      tabs.map((tab) => tab.key),
      activeTab,
    );
    if (!target) return;
    event.preventDefault();
    setActiveTab(target);
    document.getElementById(`settings-tab-${target}`)?.focus();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-light)]">
            <Settings className="h-5 w-5 text-accent-base" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-content">
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
      <div className="relative border-b border-[var(--color-border)]">
        <div
          ref={tabListRef}
          role="tablist"
          className="-mb-px flex gap-1 overflow-x-auto scrollbar-hide"
          aria-label={t("settings.tabsLabel")}
          onKeyDown={handleTabKeyDown}
        >
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                id={`settings-tab-${key}`}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls="settings-tabpanel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(key)}
                className={`group relative flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 pointer-coarse:min-h-11 text-sm font-medium transition-all duration-200 ${
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
        </div>
        {/* Fade on the right edge while more tabs are scrolled out of view (narrow screens). */}
        {hasHiddenTabs && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--color-bg)] to-transparent"
          />
        )}
      </div>

      {/* Tab Content */}
      <div
        id="settings-tabpanel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        className="space-y-5"
      >
        {/* Only hidden on another tab, so the design draft and the cards' own drafts survive the trip. */}
        <div hidden={activeTab !== "documents"}>
          <DocumentsTab
            model={documentDraft}
            section={documentsSection}
            onSectionChange={setDocumentsSection}
            isVisible={activeTab === "documents"}
          />
        </div>

        {activeTab === "subscription" && (
          <SubscriptionTab isLandingTab={isLandedOnSubscription} />
        )}

        {activeTab === "advanced" && <AutoReceiptSetting />}
      </div>
    </div>
  );
};
