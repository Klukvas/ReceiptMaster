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

interface TurnoverDashboardProps {
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export const TurnoverDashboard = ({ dateRange }: TurnoverDashboardProps) => {
  const { t } = useTranslation();
  const params = {
    startDate: dateRange.startDate || undefined,
    endDate: dateRange.endDate || undefined,
  };

  const { data: totalTurnover, isLoading: totalTurnoverLoading } = useQuery({
    queryKey: [
      "dashboard",
      "total-turnover",
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => dashboardApi.getTotalTurnover(params),
  });

  const { data: turnoverByProducts, isLoading: productsLoading } = useQuery({
    queryKey: [
      "dashboard",
      "turnover-by-products",
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => dashboardApi.getTurnoverByProducts(params),
  });

  const { data: turnoverByRecipients, isLoading: recipientsLoading } = useQuery(
    {
      queryKey: [
        "dashboard",
        "turnover-by-recipients",
        dateRange.startDate,
        dateRange.endDate,
      ],
      queryFn: () => dashboardApi.getTurnoverByRecipients(params),
    },
  );

  const summaryLoading = totalTurnoverLoading;

  const productChartData = (turnoverByProducts?.data || []).map((p) => ({
    name: p.product_name,
    value: p.total_turnover_cents / 100,
    quantity: p.total_quantity,
  }));

  const recipientChartData = (turnoverByRecipients?.data || []).map((r) => ({
    name: r.recipient_name,
    value: r.total_turnover_cents / 100,
    quantity: r.total_orders,
  }));

  const recipientListData = (turnoverByRecipients?.data || []).map((r) => ({
    recipient_id: r.recipient_id,
    recipient_name: r.recipient_name,
    total_cents: r.total_turnover_cents,
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
              label={t("dashboard.totalTurnover", "Total Turnover")}
              value={formatCurrency(
                totalTurnover?.data?.total_turnover_cents || 0,
                totalTurnover?.data?.currency,
              )}
              icon={<DollarSign className="h-5 w-5" />}
              accentColor="purple"
            />
          </div>
          <KPISecondaryCard
            label={t("dashboard.totalOrders")}
            value={String(totalTurnover?.data?.total_orders || 0)}
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
          title={t("dashboard.turnoverByProduct")}
          data={productChartData}
          isLoading={productsLoading}
          color="#8b5cf6"
          emptyMessage={t("dashboard.noData")}
        />
        <TopProductsChart
          title={t("dashboard.topProductsByQty", "Top Products by Quantity")}
          data={productChartData}
          isLoading={productsLoading}
          color="#a78bfa"
          emptyMessage={t("dashboard.noData")}
        />
      </div>

      {/* Recipients row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RevenueChart
          title={t("dashboard.turnoverByRecipient")}
          data={recipientChartData}
          isLoading={recipientsLoading}
          color="#8b5cf6"
          emptyMessage={t("dashboard.noData")}
        />
        <TopRecipientsList
          recipients={recipientListData}
          isLoading={recipientsLoading}
          emptyMessage={t("dashboard.noData")}
          accentColor="purple"
        />
      </div>
    </div>
  );
};
