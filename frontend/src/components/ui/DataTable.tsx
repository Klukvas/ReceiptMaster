import React, { useState, useRef, useEffect } from"react";
import {
 Search,
 X,
 ChevronUp,
 ChevronDown,
 ArrowUpDown,
 Loader2,
} from"lucide-react";
import { Card } from"./Card";
import { Button } from"./Button";
import { Pagination } from"./Pagination";
import { useTranslation } from"../../hooks/useTranslation";
import type { ColumnDef, SortOrder } from"../../hooks/useServerPagination";

interface DataTableProps<T> {
 items: T[];
 total: number;
 isLoading: boolean;
 isFetching?: boolean;
 error: Error | null;

 currentPage: number;
 totalPages: number;
 itemsPerPage: number;
 onPageChange: (page: number) => void;
 onItemsPerPageChange: (size: number) => void;
 itemsPerPageOptions?: number[];

 searchQuery: string;
 onSearchChange: (query: string) => void;
 searchPlaceholder?: string;
 showSearch?: boolean;

 sortBy: string | null;
 sortOrder: SortOrder;
 onSort: (columnKey: string) => void;

 columns: ColumnDef<T>[];
 visibleColumns: ColumnDef<T>[];
 onToggleColumn: (columnKey: string) => void;
 showColumnToggle?: boolean;

 rowKey: (item: T) => string;
 rowClassName?: (item: T, index: number) => string;

 emptyIcon?: React.ReactNode;
 emptyMessage?: string;
 emptySearchMessage?: string;

 renderActions?: (item: T) => React.ReactNode;
 actionsHeader?: string;

 renderCard?: (item: T) => React.ReactNode;
 toolbarExtra?: React.ReactNode;

 onRowClick?: (item: T) => void;

 selectable?: boolean;
 selectedKeys?: Set<string>;
 onSelectionChange?: (keys: Set<string>) => void;
}

export function DataTable<T>({
 items,
 total,
 isLoading,
 isFetching,
 error,
 currentPage,
 totalPages,
 itemsPerPage,
 onPageChange,
 onItemsPerPageChange,
 itemsPerPageOptions = [10, 20, 50, 100],
 searchQuery,
 onSearchChange,
 searchPlaceholder,
 showSearch = false,
 sortBy,
 sortOrder,
 onSort,
 columns,
 visibleColumns,
 onToggleColumn,
 showColumnToggle = false,
 rowKey,
 rowClassName,
 emptyIcon,
 emptyMessage,
 emptySearchMessage,
 renderActions,
 actionsHeader,
 renderCard,
 toolbarExtra,
 onRowClick,
 selectable = false,
 selectedKeys,
 onSelectionChange,
}: DataTableProps<T>) {
 const { t } = useTranslation();
 const [showColumnMenu, setShowColumnMenu] = useState(false);
 const columnMenuRef = useRef<HTMLDivElement>(null);

 // Close column menu on click outside
 useEffect(() => {
 if (!showColumnMenu) return;
 const handleClick = (e: MouseEvent) => {
 if (
 columnMenuRef.current &&
 !columnMenuRef.current.contains(e.target as Node)
 ) {
 setShowColumnMenu(false);
 }
 };
 document.addEventListener("mousedown", handleClick);
 return () => document.removeEventListener("mousedown", handleClick);
 }, [showColumnMenu]);

 const colSpan =
 visibleColumns.length + (renderActions ? 1 : 0) + (selectable ? 1 : 0);

 const allKeys = items.map((item) => rowKey(item));
 const allSelected =
 selectable &&
 items.length > 0 &&
 selectedKeys &&
 allKeys.every((k) => selectedKeys.has(k));

 const toggleAll = () => {
 if (!onSelectionChange || !selectedKeys) return;
 if (allSelected) {
 const next = new Set(selectedKeys);
 allKeys.forEach((k) => next.delete(k));
 onSelectionChange(next);
 } else {
 const next = new Set(selectedKeys);
 allKeys.forEach((k) => next.add(k));
 onSelectionChange(next);
 }
 };

 const toggleOne = (key: string) => {
 if (!onSelectionChange || !selectedKeys) return;
 const next = new Set(selectedKeys);
 if (next.has(key)) next.delete(key);
 else next.add(key);
 onSelectionChange(next);
 };

 const defaultRowClass = () =>"";

 const getRowClass = rowClassName || defaultRowClass;

 const renderSortIcon = (col: ColumnDef<T>) => {
 const colSortKey = col.sortKey || col.key;
 if (sortBy === colSortKey) {
 return sortOrder ==="ASC" ? (
 <ChevronUp className="w-3.5 h-3.5" />
 ) : (
 <ChevronDown className="w-3.5 h-3.5" />
 );
 }
 return <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />;
 };

 return (
 <div className="space-y-4">
 {/* Toolbar */}
 {(showSearch || showColumnToggle || toolbarExtra) && (
 <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
 {showSearch && (
 <div className="relative flex-1 min-w-0 w-full sm:w-auto">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
 <Search className="h-4 w-4 text-content-tertiary" />
 </div>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => onSearchChange(e.target.value)}
 placeholder={searchPlaceholder || t("common.search")}
 className="w-full pl-10 pr-10 py-2.5 text-sm border border-[var(--color-border)] rounded-xl bg-elevated text-content placeholder-content-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
 />
 {searchQuery && (
 <button
 onClick={() => onSearchChange("")}
 className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-content-tertiary hover:text-content-secondary transition-colors"
 >
 <X className="h-4 w-4" />
 </button>
 )}
 </div>
 )}

 {toolbarExtra}

 {showColumnToggle && (
 <div className="relative" ref={columnMenuRef}>
 <Button
 variant="outline"
 size="sm"
 onClick={() => setShowColumnMenu(!showColumnMenu)}
 className="rounded-xl border-[var(--color-border)]"
 >
 {t("common.columns")}
 </Button>
 {showColumnMenu && (
 <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-56 bg-elevated rounded-xl shadow-lg border border-[var(--color-border)] z-50 animate-modal-content">
 <div className="py-2 px-3">
 {columns
 .filter((col) => col.hideable !== false)
 .map((col) => (
 <label
 key={col.key}
 className="flex items-center py-1.5 cursor-pointer"
 >
 <input
 type="checkbox"
 checked={col.visible !== false}
 onChange={() => onToggleColumn(col.key)}
 className="rounded border-[var(--color-border)] text-accent-base focus:ring-[var(--color-ring)]"
 />
 <span className="ml-2 text-sm text-content-secondary">
 {col.header}
 </span>
 </label>
 ))}
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {/* Error state */}
 {error && (
 <Card>
 <div className="text-center py-8 text-danger-base">
 {error.message || t("common.error")}
 </div>
 </Card>
 )}

 {/* Desktop Table */}
 <div className="hidden lg:block bg-elevated rounded-2xl border border-[var(--color-border)] shadow-sm">
 <div className="overflow-x-auto relative rounded-2xl">
 {isFetching && items.length > 0 && (
 <div className="absolute inset-0 bg-elevated/60 flex items-center justify-center z-10 backdrop-blur-[1px]">
 <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
 </div>
 )}
 <table className="min-w-full">
 <thead>
 <tr className="border-b border-[var(--color-border-light)]">
 {selectable && (
 <th className="px-4 py-3.5 w-10">
 <input
 type="checkbox"
 checked={!!allSelected}
 onChange={toggleAll}
 className="rounded border-[var(--color-border)] text-accent-base focus:ring-[var(--color-ring)]"
 />
 </th>
 )}
 {visibleColumns.map((col) => (
 <th
 key={col.key}
 className="px-6 py-3.5 text-left text-xs font-medium text-content-tertiary uppercase tracking-wider"
 >
 {col.sortable ? (
 <button
 onClick={() => onSort(col.key)}
 className="flex items-center gap-1 hover:text-content-secondary transition-colors duration-150"
 >
 <span>{col.header}</span>
 {renderSortIcon(col)}
 </button>
 ) : (
 <span>{col.header}</span>
 )}
 </th>
 ))}
 {renderActions && (
 <th className="px-4 py-3.5 w-12">
 <span className="sr-only">
 {actionsHeader || t("common.actions")}
 </span>
 </th>
 )}
 </tr>
 </thead>
 <tbody>
 {isLoading && items.length === 0 ? (
 <tr>
 <td colSpan={colSpan} className="text-center py-16">
 <Loader2 className="w-5 h-5 animate-spin text-primary-500 mx-auto" />
 </td>
 </tr>
 ) : items.length === 0 ? (
 <tr>
 <td colSpan={colSpan} className="px-6 py-16 text-center">
 <div className="flex flex-col items-center text-content-tertiary">
 {emptyIcon}
 <p className="mt-3 text-sm">
 {searchQuery
 ? emptySearchMessage || t("common.noResults")
 : emptyMessage || t("common.noData")}
 </p>
 </div>
 </td>
 </tr>
 ) : (
 items.map((item, index) => {
 const key = rowKey(item);
 const isSelected = selectedKeys?.has(key) ?? false;
 return (
 <tr
 key={key}
 onClick={(e) => {
 if (!onRowClick) return;
 const target = e.target as HTMLElement;
 if (target.closest("button, a, input, [role='menu']"))
 return;
 onRowClick(item);
 }}
 className={`
 border-b border-[var(--color-border-light)] last:border-0
 transition-colors duration-150
 hover:bg-surface-alt
 ${onRowClick ?"cursor-pointer" :""}
 ${isSelected ?"bg-[var(--color-accent-light)]" :""}
 ${getRowClass(item, index)}
 `}
 >
 {selectable && (
 <td className="px-4 py-4 w-10">
 <input
 type="checkbox"
 checked={isSelected}
 onChange={() => toggleOne(key)}
 className="rounded border-[var(--color-border)] text-accent-base focus:ring-[var(--color-ring)]"
 />
 </td>
 )}
 {visibleColumns.map((col) => (
 <td
 key={col.key}
 className="px-6 py-4 whitespace-nowrap"
 >
 {col.render(item)}
 </td>
 ))}
 {renderActions && (
 <td className="px-4 py-4 whitespace-nowrap text-right">
 {renderActions(item)}
 </td>
 )}
 </tr>
 );
 })
 )}
 </tbody>
 </table>
 </div>
 </div>

 {/* Mobile View */}
 <div className="lg:hidden">
 {isLoading && items.length === 0 ? (
 <div className="flex justify-center py-16">
 <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
 </div>
 ) : items.length === 0 ? (
 <div className="flex flex-col items-center text-content-tertiary py-16">
 {emptyIcon}
 <p className="mt-3 text-sm">
 {searchQuery
 ? emptySearchMessage || t("common.noResults")
 : emptyMessage || t("common.noData")}
 </p>
 </div>
 ) : renderCard ? (
 <div className="space-y-3">
 {items.map((item) => (
 <React.Fragment key={rowKey(item)}>
 {renderCard(item)}
 </React.Fragment>
 ))}
 </div>
 ) : (
 <div className="space-y-3">
 {items.map((item) => (
 <div
 key={rowKey(item)}
 className="bg-elevated rounded-xl border border-[var(--color-border)] p-4"
 >
 <div className="space-y-2.5">
 {visibleColumns.map((col) => (
 <div
 key={col.key}
 className="flex justify-between items-start"
 >
 <span className="text-xs font-medium text-content-tertiary uppercase tracking-wider">
 {col.header}
 </span>
 <span className="text-sm text-content text-right">
 {col.renderCard
 ? col.renderCard(item)
 : col.render(item)}
 </span>
 </div>
 ))}
 {renderActions && (
 <div className="pt-2.5 border-t border-[var(--color-border-light)] flex justify-end">
 {renderActions(item)}
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Pagination */}
 {total > 0 && (
 <div className="pt-1">
 <Pagination
 currentPage={currentPage}
 totalPages={totalPages}
 totalItems={total}
 itemsPerPage={itemsPerPage}
 onPageChange={onPageChange}
 onItemsPerPageChange={onItemsPerPageChange}
 itemsPerPageOptions={itemsPerPageOptions}
 />
 </div>
 )}
 </div>
 );
}
