import { useQuery } from "@tanstack/react-query";
import { DollarSign, ShoppingCart, CalendarDays } from "lucide-react";
import { dashboardApi, formatCurrency } from "../../lib/api";
import { StatCardSkeleton } from "../ui/Skeleton";
import { RevenueChart } from "./RevenueChart";
import { TopProductsChart } from "./TopProductsChart";
import { TopRecipientsList } from "./TopRecipientsList";
import { KPIPrimaryCard } from "./KPIPrimaryCard";
import { KPISecondaryCard } from "./KPISecondaryCard";
import { useTranslation } from "../../hooks/useTranslation";

interface RevenueDashboardProps {
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export const RevenueDashboard = ({ dateRange }: RevenueDashboardProps) => {
  const { t } = useTranslation();
  const params = {
    startDate: dateRange.startDate || undefined,
    endDate: dateRange.endDate || undefined,
  };

  const { data: totalRevenue, isLoading: totalRevenueLoading } = useQuery({
    queryKey: [
      "dashboard",
      "total-revenue",
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => dashboardApi.getTotalRevenue(params),
  });

  const { data: revenueByProducts, isLoading: productsLoading } = useQuery({
    queryKey: [
      "dashboard",
      "revenue-by-products",
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => dashboardApi.getRevenueByProducts(params),
  });

  const { data: revenueByRecipients, isLoading: recipientsLoading } = useQuery({
    queryKey: [
      "dashboard",
      "revenue-by-recipients",
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => dashboardApi.getRevenueByRecipients(params),
  });

  const summaryLoading = totalRevenueLoading;

  const productChartData = (revenueByProducts?.data || []).map((p) => ({
    name: p.product_name,
    value: p.total_revenue_cents / 100,
    quantity: p.total_quantity,
  }));

  const recipientChartData = (revenueByRecipients?.data || []).map((r) => ({
    name: r.recipient_name,
    value: r.total_revenue_cents / 100,
    quantity: r.total_orders,
  }));

  const recipientListData = (revenueByRecipients?.data || []).map((r) => ({
    recipient_id: r.recipient_id,
    recipient_name: r.recipient_name,
    total_cents: r.total_revenue_cents,
    total_orders: r.total_orders,
    currency: r.currency,
  }));

  const periodText =
    dateRange.startDate && dateRange.endDate
      ? `${new Date(dateRange.startDate).toLocaleDateString()} — ${new Date(dateRange.endDate).toLocaleDateString()}`
      : t("dashboard.allTime", "All time");

  return (
    <div className="space-y-6">
      {/* KPI section */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <StatCardSkeleton />
          </div>
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <KPIPrimaryCard
              label={t("dashboard.totalRevenue")}
              value={formatCurrency(
                totalRevenue?.data?.total_revenue_cents || 0,
                totalRevenue?.data?.currency,
              )}
              icon={<DollarSign className="h-5 w-5" />}
              accentColor="green"
            />
          </div>
          <KPISecondaryCard
            label={t("dashboard.totalOrders")}
            value={String(totalRevenue?.data?.total_orders || 0)}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <KPISecondaryCard
            label={t("dashboard.period", "Period")}
            value={periodText}
            icon={<CalendarDays className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RevenueChart
          title={t("dashboard.revenueByProduct")}
          data={productChartData}
          isLoading={productsLoading}
          color="#10b981"
          emptyMessage={t("dashboard.noData")}
        />
        <TopProductsChart
          title={t("dashboard.topProductsByQty", "Top Products by Quantity")}
          data={productChartData}
          isLoading={productsLoading}
          color="#8b5cf6"
          emptyMessage={t("dashboard.noData")}
        />
      </div>

      {/* Recipients row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RevenueChart
          title={t("dashboard.revenueByRecipient")}
          data={recipientChartData}
          isLoading={recipientsLoading}
          color="#10b981"
          emptyMessage={t("dashboard.noData")}
        />
        <TopRecipientsList
          recipients={recipientListData}
          isLoading={recipientsLoading}
          emptyMessage={t("dashboard.noData")}
          accentColor="green"
        />
      </div>
    </div>
  );
};
