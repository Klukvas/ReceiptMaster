import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Users,
  ShoppingCart,
  Receipt,
  TrendingUp,
  DollarSign,
  Calendar,
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
} from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SkeletonCard } from "../components/ui/Skeleton";
import { StatCard } from "../components/dashboard/StatCard";
import { RevenueSparkline } from "../components/dashboard/RevenueSparkline";
import { OrderStatusSummary } from "../components/dashboard/OrderStatusSummary";
import { LowStockWidget } from "../components/dashboard/LowStockWidget";
import { OnboardingModal } from "../components/onboarding/OnboardingModal";
import { useTranslation } from "../hooks/useTranslation";
import { useAuth } from "../hooks/useAuth";

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
    queryClient.invalidateQueries();
  };

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll({ limit: 5 }),
  });

  const { data: recipientsData, isLoading: recipientsLoading } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => recipientsApi.getAll({ limit: 5 }),
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersApi.getAll({ limit: 5 }),
  });

  const { data: receiptsData, isLoading: receiptsLoading } = useQuery({
    queryKey: ["receipts", "dashboard"],
    queryFn: () => receiptsApi.getAll({ limit: 5 }),
  });

  const { data: totalRevenue, isLoading: revenueLoading } = useQuery({
    queryKey: ["totalRevenue"],
    queryFn: () => dashboardApi.getTotalRevenue(),
  });

  const { data: totalTurnover, isLoading: turnoverLoading } = useQuery({
    queryKey: ["totalTurnover"],
    queryFn: () => dashboardApi.getTotalTurnover(),
  });

  const statsLoading =
    productsLoading || recipientsLoading || ordersLoading || receiptsLoading;

  const stats = [
    {
      name: t("navigation.products"),
      value: productsData?.data?.total || 0,
      icon: Package,
      href: "/products",
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      name: t("navigation.recipients"),
      value: recipientsData?.data?.total || 0,
      icon: Users,
      href: "/recipients",
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    },
    {
      name: t("navigation.orders"),
      value: ordersData?.data?.total || 0,
      icon: ShoppingCart,
      href: "/orders",
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
    },
    {
      name: t("home.receipts"),
      value: receiptsData?.data?.total || 0,
      icon: Receipt,
      href: "/receipts",
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">
          {t("home.welcome")}, {user?.email?.split("@")[0]}!
        </h1>
        <p className="text-blue-100 text-lg">{t("home.subtitle")}</p>
      </div>

      {/* Entity count cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map((stat) => <StatCard key={stat.name} {...stat} />)}
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {revenueLoading || turnoverLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              name={t("home.totalRevenue")}
              value={formatCurrency(
                totalRevenue?.data?.total_revenue_cents || 0,
                totalRevenue?.data?.currency,
              )}
              description={t("home.revenueDescription")}
              icon={DollarSign}
              color="text-green-600"
              bgColor="bg-green-100 dark:bg-green-900/30"
            />
            <StatCard
              name={t("home.totalTurnover")}
              value={formatCurrency(
                totalTurnover?.data?.total_turnover_cents || 0,
                totalTurnover?.data?.currency,
              )}
              description={t("home.turnoverDescription")}
              icon={TrendingUp}
              color="text-blue-600"
              bgColor="bg-blue-100 dark:bg-blue-900/30"
            />
          </>
        )}
      </div>

      {/* Charts row: sparkline + order status donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueSparkline />
        </div>
        <OrderStatusSummary />
      </div>

      {/* Low stock widget */}
      <LowStockWidget />

      {/* Latest data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest products */}
        <Card title={t("home.latestProducts")}>
          {productsData?.data?.data && productsData.data.data.length > 0 ? (
            <div className="space-y-3">
              {productsData.data.data.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {product.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatCurrency(product.sale_price_cents)}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {product.quantity} {t("orders.pieces", "pcs")}
                  </div>
                </div>
              ))}
              <Link to="/products">
                <Button variant="outline" className="w-full mt-4">
                  {t("home.viewAllProducts")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {t("home.noProducts", "No products yet")}
              </p>
              <Link to="/products">
                <Button>{t("home.addFirstProduct")}</Button>
              </Link>
            </div>
          )}
        </Card>

        {/* Latest recipients */}
        <Card title={t("home.latestRecipients")}>
          {recipientsData?.data?.data && recipientsData.data.data.length > 0 ? (
            <div className="space-y-3">
              {recipientsData.data.data.map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {recipient.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {recipient.email}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {recipient.phone}
                  </div>
                </div>
              ))}
              <Link to="/recipients">
                <Button variant="outline" className="w-full mt-4">
                  {t("home.viewAllRecipients")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {t("home.noRecipients", "No recipients yet")}
              </p>
              <Link to="/recipients">
                <Button>{t("home.addFirstRecipient")}</Button>
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Latest orders */}
      <Card title={t("home.latestOrders")}>
        {ordersData?.data?.data && ordersData.data.data.length > 0 ? (
          <div className="space-y-3">
            {ordersData.data.data.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {t("home.order", "Order")} #{order.id.slice(-8)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(order.total_cents)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {order.status}
                  </p>
                </div>
              </div>
            ))}
            <Link to="/orders">
              <Button variant="outline" className="w-full mt-4">
                {t("home.viewAllOrders")}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="text-center py-8">
            <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {t("home.noOrders", "No orders yet")}
            </p>
            <Link to="/orders">
              <Button>{t("home.createFirstOrder")}</Button>
            </Link>
          </div>
        )}
      </Card>

      {/* Quick actions */}
      <Card title={t("home.quickActions")}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/products">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <Package className="h-6 w-6 mb-2" />
              {t("home.addProduct")}
            </Button>
          </Link>
          <Link to="/recipients">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <Users className="h-6 w-6 mb-2" />
              {t("home.addRecipient")}
            </Button>
          </Link>
          <Link to="/orders">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <ShoppingCart className="h-6 w-6 mb-2" />
              {t("home.createOrder")}
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col items-center justify-center"
            >
              <Calendar className="h-6 w-6 mb-2" />
              {t("home.viewDashboard")}
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
