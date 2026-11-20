import { useState, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RevenueDashboard } from '../components/dashboard/RevenueDashboard';
import { TurnoverDashboard } from '../components/dashboard/TurnoverDashboard';
import { AnalyticsHeader } from '../components/dashboard/AnalyticsHeader';
import { AnalyticsFilterBar } from '../components/dashboard/AnalyticsFilterBar';
import { buildPeriodLabel } from '../components/dashboard/periodLabel';
import { useTranslation } from '../hooks/useTranslation';
import { dashboardApi } from '../lib/api';
import { exportToCsv } from '../lib/csv-export';
import { usePlan } from '../hooks/usePlan';
import { ContentSpinner } from '../components/common/PageSpinner';
import { AnalyticsUpsell } from '../components/dashboard/AnalyticsUpsell';
import { AnalyticsHistoryNote } from '../components/dashboard/AnalyticsHistoryNote';

function daysAgo(days: number): string {
 const d = new Date();
 d.setDate(d.getDate() - days);
 return d.toISOString().split('T')[0];
}

// UTC on purpose: the API reads a date-only bound as a UTC day, which then always contains "now".
function today(): string {
 return new Date().toISOString().split('T')[0];
}

interface DateRange {
 startDate: string;
 endDate: string;
}

/**
 * A range kept inside the plan's history window (ISO dates compare correctly as strings).
 * A cleared or too-early start becomes the first allowed day: the server would clamp it
 * anyway, and the label and the CSV name must show the period that was really asked for.
 */
function clampToWindow(range: DateRange, earliestDate: string | undefined): DateRange {
 if (!earliestDate) return range;
 const startDate =
 !range.startDate || range.startDate < earliestDate ? earliestDate : range.startDate;
 const endDate = range.endDate && range.endDate < startDate ? startDate : range.endDate;
 return { startDate, endDate };
}

/**
 * The analytics endpoints answer 402 on a plan without analytics, so nothing below is
 * mounted until the plan is known, and a plan without the feature gets the upsell instead.
 */
export const DashboardPage = () => {
 const plan = usePlan();
 if (!plan.isSettled) return <ContentSpinner />;
 if (!plan.allows('analytics')) return <AnalyticsUpsell />;
 return (
 <AnalyticsContent
 // A plan change (after an upgrade) starts from that plan's own window.
 key={plan.limits?.analyticsHistoryDays ?? 'all'}
 historyDays={plan.limits?.analyticsHistoryDays ?? null}
 canExportCsv={plan.allows('csvExport')}
 />
 );
};

interface AnalyticsContentProps {
 /** How far back the plan lets analytics look; null = the whole history. */
 historyDays: number | null;
 canExportCsv: boolean;
}

const AnalyticsContent = ({ historyDays, canExportCsv }: AnalyticsContentProps) => {
 const { t } = useTranslation();
 // With a limited history "all time" would be a false label: the widest range is the window.
 const widestRange = useMemo(
 () =>
 historyDays === null
 ? { startDate: '', endDate: '' }
 : { startDate: daysAgo(historyDays), endDate: today() },
 [historyDays],
 );
 const earliestDate = historyDays === null ? undefined : widestRange.startDate;
 // What the date fields hold, which may be half-typed; everything else reads `dateRange`.
 const [enteredRange, setEnteredRange] = useState<DateRange>(widestRange);
 const dateRange = useMemo(
 () => clampToWindow(enteredRange, earliestDate),
 [enteredRange, earliestDate],
 );
 const [activePreset, setActivePreset] = useState<number | null>(historyDays);
 const [activeTab, setActiveTab] = useState<'revenue' | 'turnover'>('revenue');

 const presets = useMemo(
 () => [
 { label: t('dashboard.last7d', '7d'), days: 7 },
 { label: t('dashboard.last30d', '30d'), days: 30 },
 { label: t('dashboard.last90d', '90d'), days: 90 },
 { label: t('dashboard.lastYear', '1y'), days: 365 },
 ].filter((preset) => historyDays === null || preset.days <= historyDays),
 [t, historyDays],
 );

 const handlePresetClick = (days: number) => {
 setEnteredRange({ startDate: daysAgo(days), endDate: today() });
 setActivePreset(days);
 };

 // ISO dates compare correctly as strings. Moving one end past the other drags the
 // other end along instead of leaving a reversed range that silently shows zeros.
 const handleStartDateChange = (value: string) => {
 setEnteredRange((prev) => ({
 startDate: value,
 endDate: value && prev.endDate && value > prev.endDate ? value : prev.endDate,
 }));
 setActivePreset(null);
 };

 const handleEndDateChange = (value: string) => {
 setEnteredRange((prev) => ({
 startDate: value && prev.startDate && value < prev.startDate ? value : prev.startDate,
 endDate: value,
 }));
 setActivePreset(null);
 };

 // Leaving a field snaps it to the period in use, so the field and the label never differ.
 const settleDates = () =>
 setEnteredRange((prev) => clampToWindow(prev, earliestDate));

 const clearDates = () => {
 setEnteredRange(widestRange);
 setActivePreset(historyDays);
 };

 const periodLabel = buildPeriodLabel(dateRange, t);

 // CSV export data
 const params = {
 startDate: dateRange.startDate || undefined,
 endDate: dateRange.endDate || undefined,
 };

 const { data: revenueByProducts, isPlaceholderData: isRevenueExportStale } = useQuery({
 queryKey: ['dashboard', 'revenue-by-products', dateRange.startDate, dateRange.endDate],
 queryFn: () => dashboardApi.getRevenueByProducts(params),
 placeholderData: keepPreviousData,
 });

 const { data: turnoverByProducts, isPlaceholderData: isTurnoverExportStale } = useQuery({
 queryKey: ['dashboard', 'turnover-by-products', dateRange.startDate, dateRange.endDate],
 queryFn: () => dashboardApi.getTurnoverByProducts(params),
 placeholderData: keepPreviousData,
 });

 const exportRows = activeTab === 'revenue' ? revenueByProducts?.data : turnoverByProducts?.data;
 // Kept-over rows of the previous period would be exported under the new period's name.
 const isExportStale = activeTab === 'revenue' ? isRevenueExportStale : isTurnoverExportStale;
 const canExport = (exportRows?.length ?? 0) > 0 && !isExportStale;

 const handleExportCsv = () => {
 if (activeTab === 'revenue' && revenueByProducts?.data) {
 exportToCsv(
 revenueByProducts.data.map((p) => ({
 product_name: p.product_name,
 // Unknown profit stays an empty cell, never 0.00.
 total_revenue:
 p.total_revenue_cents === null ? '' : (p.total_revenue_cents / 100).toFixed(2),
 total_quantity: String(p.total_quantity),
 currency: p.currency,
 profit_complete: String(p.profit_complete),
 unknown_cost_lines: String(p.unknown_cost_lines),
 unknown_cost_turnover: (p.unknown_cost_turnover_cents / 100).toFixed(2),
 })),
 [
 { key: 'product_name', header: t('products.productName', 'Product') },
 { key: 'total_revenue', header: t('dashboard.revenue', 'Revenue') },
 { key: 'total_quantity', header: t('products.quantity', 'Quantity') },
 { key: 'currency', header: t('products.currency', 'Currency') },
 { key: 'profit_complete', header: t('dashboard.csvProfitComplete', 'Profit complete') },
 { key: 'unknown_cost_lines', header: t('dashboard.csvUnknownCostLines', 'Lines with unknown cost') },
 { key: 'unknown_cost_turnover', header: t('dashboard.csvUnknownCostTurnover', 'Turnover with unknown cost') },
 ],
 `revenue-${dateRange.startDate || 'all'}-${dateRange.endDate || 'time'}`,
 );
 } else if (activeTab === 'turnover' && turnoverByProducts?.data) {
 exportToCsv(
 turnoverByProducts.data.map((p) => ({
 product_name: p.product_name,
 total_turnover: (p.total_turnover_cents / 100).toFixed(2),
 total_quantity: String(p.total_quantity),
 currency: p.currency,
 })),
 [
 { key: 'product_name', header: t('products.productName', 'Product') },
 { key: 'total_turnover', header: t('dashboard.turnover', 'Turnover') },
 { key: 'total_quantity', header: t('products.quantity', 'Quantity') },
 { key: 'currency', header: t('products.currency', 'Currency') },
 ],
 `turnover-${dateRange.startDate || 'all'}-${dateRange.endDate || 'time'}`,
 );
 }
 };

 return (
 <div className="space-y-5">
 {/* Header */}
 <AnalyticsHeader
 onExportCsv={handleExportCsv}
 canExport={canExport}
 isCsvLocked={!canExportCsv}
 periodLabel={periodLabel}
 />

 {/* Filter bar */}
 <AnalyticsFilterBar
 presets={presets}
 activePreset={activePreset}
 startDate={enteredRange.startDate}
 endDate={enteredRange.endDate}
 onDateBlur={settleDates}
 onPresetClick={handlePresetClick}
 onStartDateChange={handleStartDateChange}
 onEndDateChange={handleEndDateChange}
 onClear={clearDates}
 minDate={earliestDate}
 canClear={dateRange.startDate !== widestRange.startDate || dateRange.endDate !== widestRange.endDate}
 />
 {historyDays !== null && <AnalyticsHistoryNote days={historyDays} />}

 {/* Segmented control */}
 <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-alt w-fit border border-[var(--color-border)]">
 <button
 type="button"
 aria-pressed={activeTab === 'revenue'}
 onClick={() => setActiveTab('revenue')}
 className={`relative px-5 py-2 pointer-coarse:min-h-11 text-sm font-semibold rounded-lg transition-all duration-200 motion-reduce:transition-none ${
 activeTab === 'revenue'
 ? 'bg-elevated text-content shadow-sm'
 : 'text-content-tertiary hover:text-content-secondary'
 }`}
 >
 {t('dashboard.revenue')}
 </button>
 <button
 type="button"
 aria-pressed={activeTab === 'turnover'}
 onClick={() => setActiveTab('turnover')}
 className={`relative px-5 py-2 pointer-coarse:min-h-11 text-sm font-semibold rounded-lg transition-all duration-200 motion-reduce:transition-none ${
 activeTab === 'turnover'
 ? 'bg-elevated text-content shadow-sm'
 : 'text-content-tertiary hover:text-content-secondary'
 }`}
 >
 {t('dashboard.turnover')}
 </button>
 </div>

 {/* Dashboard content */}
 {activeTab === 'revenue' ? (
 <RevenueDashboard dateRange={dateRange} />
 ) : (
 <TurnoverDashboard dateRange={dateRange} />
 )}
 </div>
 );
};
