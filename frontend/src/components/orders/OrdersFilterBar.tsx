import React, { useState, useMemo } from"react";
import { Filter, X, ChevronDown, Calendar } from"lucide-react";
import { Button } from"../ui/Button";
import { useTranslation } from"../../hooks/useTranslation";

interface OrdersFilterBarProps {
 statusFilter: string;
 onStatusFilterChange: (value: string) => void;
 startDate: string;
 onStartDateChange: (value: string) => void;
 endDate: string;
 onEndDateChange: (value: string) => void;
 minAmount: string;
 onMinAmountChange: (value: string) => void;
 maxAmount: string;
 onMaxAmountChange: (value: string) => void;
 onClearAll: () => void;
}

export const OrdersFilterBar: React.FC<OrdersFilterBarProps> = ({
 statusFilter,
 onStatusFilterChange,
 startDate,
 onStartDateChange,
 endDate,
 onEndDateChange,
 minAmount,
 onMinAmountChange,
 maxAmount,
 onMaxAmountChange,
 onClearAll,
}) => {
 const { t } = useTranslation();
 const [showAdvanced, setShowAdvanced] = useState(false);

 const activeFilterCount = useMemo(() => {
 let count = 0;
 if (statusFilter) count++;
 if (startDate) count++;
 if (endDate) count++;
 if (minAmount) count++;
 if (maxAmount) count++;
 return count;
 }, [statusFilter, startDate, endDate, minAmount, maxAmount]);

 const hasAdvancedFilters = startDate || endDate || minAmount || maxAmount;

 return (
 <div className="space-y-3">
 {/* Primary filter row */}
 <div className="flex items-center gap-2 flex-wrap">
 {/* Status filter */}
 <div className="relative">
 <select
 value={statusFilter}
 onChange={(e) => onStatusFilterChange(e.target.value)}
 className="appearance-none pl-3 pr-8 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-elevated text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all cursor-pointer"
 >
 <option value="">{t("orders.allStatuses")}</option>
 <option value="draft">{t("orders.draft")}</option>
 <option value="confirmed">{t("orders.confirmed")}</option>
 <option value="cancelled">{t("orders.cancelled")}</option>
 </select>
 <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary pointer-events-none" />
 </div>

 {/* Advanced filters toggle */}
 <Button
 size="sm"
 variant={showAdvanced ?"primary" :"outline"}
 onClick={() => setShowAdvanced(!showAdvanced)}
 className="relative rounded-lg"
 >
 <Filter className="w-3.5 h-3.5 mr-1.5" />
 {t("orders.filters")}
 {hasAdvancedFilters && (
 <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full" />
 )}
 </Button>

 {/* Active filter count badge + clear */}
 {activeFilterCount > 0 && (
 <div className="flex items-center gap-2">
 <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-[var(--color-accent-light)] text-primary-700 border border-accent-base">
 {activeFilterCount} {t("orders.activeFilters")}
 </span>
 <button
 onClick={onClearAll}
 className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-content-tertiary hover:text-content-secondary transition-colors"
 >
 <X className="w-3 h-3" />
 {t("orders.clearAll")}
 </button>
 </div>
 )}
 </div>

 {/* Advanced filters panel */}
 {showAdvanced && (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-surface-alt rounded-xl border border-[var(--color-border)]">
 <div>
 <label className="flex items-center gap-1.5 text-xs font-medium text-content-tertiary mb-1.5">
 <Calendar className="w-3 h-3" />
 {t("orders.startDate")}
 </label>
 <input
 type="date"
 value={startDate}
 onChange={(e) => onStartDateChange(e.target.value)}
 className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
 />
 </div>
 <div>
 <label className="flex items-center gap-1.5 text-xs font-medium text-content-tertiary mb-1.5">
 <Calendar className="w-3 h-3" />
 {t("orders.endDate")}
 </label>
 <input
 type="date"
 value={endDate}
 onChange={(e) => onEndDateChange(e.target.value)}
 className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
 />
 </div>
 <div>
 <label className="text-xs font-medium text-content-tertiary mb-1.5 block">
 {t("orders.minAmount")}
 </label>
 <input
 type="number"
 min="0"
 step="0.01"
 value={minAmount}
 onChange={(e) => onMinAmountChange(e.target.value)}
 placeholder="0.00"
 className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
 />
 </div>
 <div>
 <label className="text-xs font-medium text-content-tertiary mb-1.5 block">
 {t("orders.maxAmount")}
 </label>
 <input
 type="number"
 min="0"
 step="0.01"
 value={maxAmount}
 onChange={(e) => onMaxAmountChange(e.target.value)}
 placeholder="0.00"
 className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
 />
 </div>
 </div>
 )}
 </div>
 );
};
