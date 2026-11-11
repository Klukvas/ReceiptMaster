import { useState, useEffect } from "react";
import { formatOrderNumber } from "../lib/order-number";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Users,
  ShoppingCart,
  Receipt,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  productsApi,
  recipientsApi,
  ordersApi,
  receiptsApi,
  dashboardApi,
  settingsApi,
  formatCurrency,
  formatDateOnly,
} from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import {
  EntityStatCardSkeleton,
  FinancialStatCardSkeleton,
} from "../components/dashboard/DashboardSkeletons";
import {
  LatestListCard,
  LatestRow,
} from "../components/dashboard/LatestListCard";
import { useHasFailedQuery } from "../components/dashboard/useHasFailedQuery";
import { StatCard } from "../components/dashboard/StatCard";
import { RevenueSparkline } from "../components/dashboard/RevenueSparkline";
import { ProfitStatus } from "../components/dashboard/ProfitStatus";
import { formatProfit } from "../lib/profit";
import { OrderStatusSummary } from "../components/dashboard/OrderStatusSummary";
import { LowStockWidget } from "../components/dashboard/LowStockWidget";
import { OnboardingModal } from "../components/onboarding/OnboardingModal";
import { useTranslation } from "../hooks/useTranslation";
import { useAuth } from "../hooks/useAuth";

const WIDGET_QUERY_ROOTS = ["lowStockProducts", "orderStatusSummary", "dailyRevenue"] as const;

const UNKNOWN_VALUE = "—";

export const DashboardHomePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Onboarding
  const { data: onboardingStatus } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => settingsApi.getOnboardingStatus(),
  });

  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const payload = onboardingStatus?.data;
    const normalized =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as Record<string, unknown>).data
        : payload;
    const completed = (normalized as { completed?: boolean } | undefined)
      ?.completed;
    if (completed === false) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // The wizard created data behind the dashboard's back; without this the cards
    // keep showing the zeros fetched before it ran until a full reload.
    for (const queryKey of [
      ["onboarding-status"],
      ["products"],
      ["recipients"],
      ["subscription", "status"],
      ["settings"],
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const { data: productsData, isLoading: productsLoading, isError: productsDataFailed, refetch: refetchProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll({ limit: 5 }),
  });

  const { data: recipientsData, isLoading: recipientsLoading, isError: recipientsDataFailed, refetch: refetchRecipients } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => recipientsApi.getAll({ limit: 5 }),
  });

  const { data: ordersData, isLoading: ordersLoading, isError: ordersDataFailed, refetch: refetchOrders } = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersApi.getAll({ limit: 5 }),
  });

  const { data: receiptsData, isLoading: receiptsLoading, isError: receiptsDataFailed } = useQuery({
    queryKey: ["receipts", "dashboard"],
    queryFn: () => receiptsApi.getAll({ limit: 5 }),
  });

  const { data: totalRevenue, isLoading: revenueLoading, isError: totalRevenueFailed } = useQuery({
    queryKey: ["totalRevenue"],
    queryFn: () => dashboardApi.getTotalRevenue(),
  });

  const { data: totalTurnover, isLoading: turnoverLoading, isError: totalTurnoverFailed } = useQuery({
    queryKey: ["totalTurnover"],
    queryFn: () => dashboardApi.getTotalTurnover(),
  });

  // The widgets own their queries; the banner still has to cover them.
  const hasWidgetFailed = useHasFailedQuery(WIDGET_QUERY_ROOTS);

  const hasLoadError =
    hasWidgetFailed ||
    productsDataFailed ||
    recipientsDataFailed ||
    ordersDataFailed ||
    receiptsDataFailed ||
    totalRevenueFailed ||
    totalTurnoverFailed;

  const retryFailedQueries = () =>
    queryClient.refetchQueries({
      predicate: (query) => query.state.status === "error",
    });

  const statsLoading =
    productsLoading || recipientsLoading || ordersLoading || receiptsLoading;

  const stats = [
    {
      name: t("navigation.products"),
      value: productsDataFailed ? UNKNOWN_VALUE : productsData?.data?.total || 0,
      icon: Package,
      href: "/products",
      color: "text-accent-base",
      bgColor: "bg-[var(--color-accent-light)]",
    },
    {
      name: t("navigation.recipients"),
      value: recipientsDataFailed ? UNKNOWN_VALUE : recipientsData?.data?.total || 0,
      icon: Users,
      href: "/recipients",
      color: "text-success-base",
      bgColor: "bg-[var(--color-success-light)]",
    },
    {
      name: t("navigation.orders"),
      value: ordersDataFailed ? UNKNOWN_VALUE : ordersData?.data?.total || 0,
      icon: ShoppingCart,
      href: "/orders",
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
    },
    {
      name: t("home.receipts"),
      value: receiptsDataFailed ? UNKNOWN_VALUE : receiptsData?.data?.total || 0,
      icon: Receipt,
      href: "/orders",
      color: "text-warning-base",
      bgColor: "bg-[var(--color-warning-light)]",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-accent-base to-indigo-400 dark:to-indigo-300 rounded-lg p-6 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
          {t("home.welcome")}, {user?.email?.split("@")[0]}!
        </h1>
        <p className="text-white/80 text-lg">{t("home.subtitle")}</p>
      </div>

      {hasLoadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-base bg-[var(--color-danger-light)] px-4 py-3 text-sm text-danger-base"
        >
          <span>{t("home.loadError")}</span>
          <button
            type="button"
            onClick={retryFailedQueries}
            className="font-medium underline hover:no-underline text-left pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* Entity count cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <EntityStatCardSkeleton key={i} />
            ))
          : stats.map((stat) => <StatCard key={stat.name} {...stat} />)}
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {revenueLoading || turnoverLoading ? (
          <>
            <FinancialStatCardSkeleton />
            <FinancialStatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              name={t("home.totalRevenue")}
              value={
                totalRevenueFailed
                  ? UNKNOWN_VALUE
                  : totalRevenue?.data
                    ? formatProfit(
                        totalRevenue.data.total_revenue_cents,
                        totalRevenue.data.currency,
                      )
                    : formatCurrency(0)
              }
              description={t("home.revenueDescription")}
              footer={
                totalRevenue?.data && (
                  <ProfitStatus
                    profit={totalRevenue.data.total_revenue_cents}
                    completeness={totalRevenue.data}
                    currency={totalRevenue.data.currency}
                  />
                )
              }
              icon={DollarSign}
              color="text-success-base"
              bgColor="bg-[var(--color-success-light)]"
            />
            <StatCard
              name={t("home.totalTurnover")}
              value={
                totalTurnoverFailed
                  ? UNKNOWN_VALUE
                  : formatCurrency(
                      totalTurnover?.data?.total_turnover_cents || 0,
                      totalTurnover?.data?.currency,
                    )
              }
              description={t("home.turnoverDescription")}
              icon={TrendingUp}
              color="text-accent-base"
              bgColor="bg-[var(--color-accent-light)]"
            />
          </>
        )}
      </div>

      {/* Charts row: sparkline + order status donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueSparkline
            currency={
              totalRevenue?.data?.currency ?? totalTurnover?.data?.currency
            }
          />
        </div>
        <OrderStatusSummary />
      </div>

      {/* Low stock widget */}
      <LowStockWidget />

      {/* Latest data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LatestListCard
          title={t("home.latestProducts")}
          isLoading={productsLoading}
          isError={productsDataFailed}
          onRetry={() => void refetchProducts()}
          rows={(productsData?.data?.data ?? []).map((product) => (
            <LatestRow key={product.id}>
              <div className="min-w-0">
                <p className="font-medium text-content">{product.name}</p>
                <p className="text-sm text-content-tertiary tabular-nums">
                  {formatCurrency(product.sale_price_cents)}
                </p>
              </div>
              <div className="shrink-0 whitespace-nowrap text-sm text-content-tertiary tabular-nums">
                {product.quantity} {t("orders.pieces", "pcs")}
              </div>
            </LatestRow>
          ))}
          emptyIcon={Package}
          emptyMessage={t("home.noProducts", "No products yet")}
          emptyAction={{ label: t("home.addFirstProduct"), to: "/products" }}
          viewAll={{ label: t("home.viewAllProducts"), to: "/products" }}
        />

        <LatestListCard
          title={t("home.latestRecipients")}
          isLoading={recipientsLoading}
          isError={recipientsDataFailed}
          onRetry={() => void refetchRecipients()}
          rows={(recipientsData?.data?.data ?? []).map((recipient) => (
            <LatestRow key={recipient.id}>
              <div className="min-w-0">
                <p className="font-medium text-content">{recipient.name}</p>
                <p className="text-sm text-content-tertiary">{recipient.email}</p>
              </div>
              <div className="shrink-0 whitespace-nowrap text-sm text-content-tertiary tabular-nums">
                {recipient.phone}
              </div>
            </LatestRow>
          ))}
          emptyIcon={Users}
          emptyMessage={t("home.noRecipients", "No recipients yet")}
          emptyAction={{ label: t("home.addFirstRecipient"), to: "/recipients" }}
          viewAll={{ label: t("home.viewAllRecipients"), to: "/recipients" }}
        />
      </div>

      <LatestListCard
        title={t("home.latestOrders")}
        isLoading={ordersLoading}
        isError={ordersDataFailed}
        onRetry={() => void refetchOrders()}
        rows={(ordersData?.data?.data ?? []).map((order) => (
          <LatestRow key={order.id}>
            <div className="min-w-0">
              <p className="font-medium text-content">
                {t("home.order", "Order")} {formatOrderNumber(order)}
              </p>
              <p className="text-sm text-content-tertiary tabular-nums">
                {formatDateOnly(order.created_at)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-medium text-content tabular-nums">
                {formatCurrency(order.total_cents)}
              </p>
              <p className="text-sm text-content-tertiary">
                {t(`orders.${order.status}`, order.status)}
              </p>
            </div>
          </LatestRow>
        ))}
        emptyIcon={ShoppingCart}
        emptyMessage={t("home.noOrders", "No orders yet")}
        emptyAction={{ label: t("home.createFirstOrder"), to: "/orders" }}
        viewAll={{ label: t("home.viewAllOrders"), to: "/orders" }}
      />

      {/* Quick actions */}
      <Card title={t("home.quickActions")}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Link to="/products?create=1">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <Package className="h-6 w-6 mb-2" />
              {t("home.addProduct")}
            </Button>
          </Link>
          <Link to="/recipients?create=1">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <Users className="h-6 w-6 mb-2" />
              {t("home.addRecipient")}
            </Button>
          </Link>
          <Link to="/orders?create=1">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <ShoppingCart className="h-6 w-6 mb-2" />
              {t("home.createOrder")}
            </Button>
          </Link>
          <Link to="/analytics">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <TrendingUp className="h-6 w-6 mb-2" />
              {t("navigation.analytics")}
            </Button>
          </Link>
        </div>
      </Card>

      <OnboardingModal
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
};
