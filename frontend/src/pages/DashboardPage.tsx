import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RevenueDashboard } from '../components/dashboard/RevenueDashboard';
import { TurnoverDashboard } from '../components/dashboard/TurnoverDashboard';
import { AnalyticsHeader } from '../components/dashboard/AnalyticsHeader';
import { AnalyticsFilterBar } from '../components/dashboard/AnalyticsFilterBar';
import { useTranslation } from '../hooks/useTranslation';
import { dashboardApi } from '../lib/api';
import { exportToCsv } from '../lib/csv-export';

function daysAgo(days: number): string {
 const d = new Date();
 d.setDate(d.getDate() - days);
 return d.toISOString().split('T')[0];
}

function today(): string {
 return new Date().toISOString().split('T')[0];
}

export const DashboardPage = () => {
 const { t } = useTranslation();
 const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
 const [activePreset, setActivePreset] = useState<number | null>(null);
 const [activeTab, setActiveTab] = useState<'revenue' | 'turnover'>('revenue');

 const presets = useMemo(
 () => [
 { label: t('dashboard.last7d', '7d'), days: 7 },
 { label: t('dashboard.last30d', '30d'), days: 30 },
 { label: t('dashboard.last90d', '90d'), days: 90 },
 { label: t('dashboard.lastYear', '1y'), days: 365 },
 ],
 [t],
 );

 const handlePresetClick = (days: number) => {
 setDateRange({ startDate: daysAgo(days), endDate: today() });
 setActivePreset(days);
 };

 const handleStartDateChange = (value: string) => {
 setDateRange((prev) => ({ ...prev, startDate: value }));
 setActivePreset(null);
 };

 const handleEndDateChange = (value: string) => {
 setDateRange((prev) => ({ ...prev, endDate: value }));
 setActivePreset(null);
 };

 const clearDates = () => {
 setDateRange({ startDate: '', endDate: '' });
 setActivePreset(null);
 };

 const periodLabel =
 dateRange.startDate && dateRange.endDate
 ? `${new Date(dateRange.startDate).toLocaleDateString()} — ${new Date(dateRange.endDate).toLocaleDateString()}`
 : t('dashboard.allTime', 'All time');

 // CSV export data
 const params = {
 startDate: dateRange.startDate || undefined,
 endDate: dateRange.endDate || undefined,
 };

 const { data: revenueByProducts } = useQuery({
 queryKey: ['dashboard', 'revenue-by-products', dateRange.startDate, dateRange.endDate],
 queryFn: () => dashboardApi.getRevenueByProducts(params),
 });

 const { data: turnoverByProducts } = useQuery({
 queryKey: ['dashboard', 'turnover-by-products', dateRange.startDate, dateRange.endDate],
 queryFn: () => dashboardApi.getTurnoverByProducts(params),
 });

 const handleExportCsv = () => {
 if (activeTab === 'revenue' && revenueByProducts?.data) {
 exportToCsv(
 revenueByProducts.data.map((p) => ({
 product_name: p.product_name,
 total_revenue: (p.total_revenue_cents / 100).toFixed(2),
 total_quantity: String(p.total_quantity),
 currency: p.currency,
 })),
 [
 { key: 'product_name', header: t('products.productName', 'Product') },
 { key: 'total_revenue', header: t('dashboard.revenue', 'Revenue') },
 { key: 'total_quantity', header: t('products.quantity', 'Quantity') },
 { key: 'currency', header: t('products.currency', 'Currency') },
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
 <AnalyticsHeader onExportCsv={handleExportCsv} periodLabel={periodLabel} />

 {/* Filter bar */}
 <AnalyticsFilterBar
 presets={presets}
 activePreset={activePreset}
 startDate={dateRange.startDate}
 endDate={dateRange.endDate}
 onPresetClick={handlePresetClick}
 onStartDateChange={handleStartDateChange}
 onEndDateChange={handleEndDateChange}
 onClear={clearDates}
 />

 {/* Segmented control */}
 <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-alt w-fit border border-[var(--color-border)]">
 <button
 onClick={() => setActiveTab('revenue')}
 className={`relative px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
 activeTab === 'revenue'
 ? 'bg-elevated text-content shadow-sm'
 : 'text-content-tertiary hover:text-content-secondary'
 }`}
 >
 {t('dashboard.revenue')}
 </button>
 <button
 onClick={() => setActiveTab('turnover')}
 className={`relative px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
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
