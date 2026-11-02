import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DollarSign, ShoppingCart, CalendarDays } from "lucide-react";
import { dashboardApi, formatCurrency } from "../../lib/api";
import { KpiPrimarySkeleton, KpiSecondarySkeleton } from "./DashboardSkeletons";
import { QueryErrorState } from "./QueryErrorState";
import { AnalyticsUpdatingFrame } from "./UpdatingCue";
import { buildPeriodLabel } from "./periodLabel";
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

  const totalTurnoverQuery = useQuery({
    queryKey: [
      "dashboard",
      "total-turnover",
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => dashboardApi.getTotalTurnover(params),
    placeholderData: keepPreviousData,
  });

  const productsQuery = useQuery({
    queryKey: [
      "dashboard",
      "turnover-by-products",
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => dashboardApi.getTurnoverByProducts(params),
    placeholderData: keepPreviousData,
  });

  const recipientsQuery = useQuery(
    {
      queryKey: [
        "dashboard",
        "turnover-by-recipients",
        dateRange.startDate,
        dateRange.endDate,
      ],
      queryFn: () => dashboardApi.getTurnoverByRecipients(params),
      placeholderData: keepPreviousData,
    },
  );

  const totalTurnover = totalTurnoverQuery.data;
  const turnoverByProducts = productsQuery.data;
  const turnoverByRecipients = recipientsQuery.data;
  const summaryLoading = totalTurnoverQuery.isLoading;
  const summaryFailed = totalTurnoverQuery.isError;
  const isUpdating = [totalTurnoverQuery, productsQuery, recipientsQuery].some(
    (query) => query.isPlaceholderData,
  );

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

  const periodText = buildPeriodLabel(dateRange, t);
  const productsCurrency =
    totalTurnover?.data?.currency ?? turnoverByProducts?.data?.[0]?.currency;
  const recipientsCurrency =
    totalTurnover?.data?.currency ?? turnoverByRecipients?.data?.[0]?.currency;

  return (
    <AnalyticsUpdatingFrame isUpdating={isUpdating}>
      <div className="space-y-6">
        {summaryFailed && (
          <QueryErrorState onRetry={() => void totalTurnoverQuery.refetch()} />
        )}

        {/* KPI section */}
        {summaryLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <KpiPrimarySkeleton hasFooter={false} />
            </div>
            <KpiSecondarySkeleton />
            <KpiSecondarySkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <KPIPrimaryCard
                label={t("dashboard.totalTurnover", "Total Turnover")}
                value={
                  summaryFailed
                    ? "—"
                    : formatCurrency(
                        totalTurnover?.data?.total_turnover_cents || 0,
                        totalTurnover?.data?.currency,
                      )
                }
                icon={<DollarSign className="h-5 w-5" />}
                accentColor="purple"
              />
            </div>
            <KPISecondaryCard
              label={t("dashboard.totalOrders")}
              value={summaryFailed ? "—" : String(totalTurnover?.data?.total_orders || 0)}
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
            isLoading={productsQuery.isLoading}
            isError={productsQuery.isError}
            onRetry={() => void productsQuery.refetch()}
            currency={productsCurrency}
            color="#8b5cf6"
            emptyMessage={t("dashboard.noData")}
          />
          <TopProductsChart
            title={t("dashboard.topProductsByQty", "Top Products by Quantity")}
            data={productChartData}
            isLoading={productsQuery.isLoading}
            isError={productsQuery.isError}
            onRetry={() => void productsQuery.refetch()}
            color="#a78bfa"
            emptyMessage={t("dashboard.noData")}
          />
        </div>

        {/* Recipients row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <RevenueChart
            title={t("dashboard.turnoverByRecipient")}
            data={recipientChartData}
            isLoading={recipientsQuery.isLoading}
            isError={recipientsQuery.isError}
            onRetry={() => void recipientsQuery.refetch()}
            currency={recipientsCurrency}
            color="#8b5cf6"
            emptyMessage={t("dashboard.noData")}
          />
          <TopRecipientsList
            recipients={recipientListData}
            isLoading={recipientsQuery.isLoading}
            isError={recipientsQuery.isError}
            onRetry={() => void recipientsQuery.refetch()}
            emptyMessage={t("dashboard.noData")}
            accentColor="purple"
          />
        </div>
      </div>
    </AnalyticsUpdatingFrame>
  );
};
