import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Mail,
  Phone,
  MapPin,
  Package,
  MoreVertical,
  Copy,
  Check,
  Calendar,
  Edit,
  Trash2,
  User,
  Loader2,
} from "lucide-react";
import {
  suppliersApi,
  formatDate,
  formatCurrency,
  type Supplier,
} from "../../lib/api";
import { Drawer } from "../ui/Drawer";
import { useTranslation } from "../../hooks/useTranslation";

interface SupplierDrawerProps {
  supplier: Supplier | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (supplier: Supplier) => void;
  onDelete?: (supplier: Supplier) => void;
}

export const SupplierDrawer = ({
  supplier,
  open,
  onClose,
  onEdit,
  onDelete,
}: SupplierDrawerProps) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  // Fetch full supplier with products relation
  const { data: fullData, isLoading: isLoadingFull } = useQuery({
    queryKey: ["supplier", supplier?.id],
    queryFn: () => suppliersApi.getById(supplier!.id),
    enabled: open && !!supplier?.id,
  });

  const handleCopyAddress = useCallback(async () => {
    const s = fullData?.data ?? supplier;
    if (!s?.address) return;
    try {
      await navigator.clipboard.writeText(s.address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      // clipboard API might not be available
    }
  }, [fullData?.data, supplier]);

  if (!supplier) return null;

  const fullSupplier = fullData?.data ?? supplier;

  const initials = fullSupplier.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Drawer open={open} onClose={onClose}>
      <div className="space-y-1">
        {/* Profile Header */}
        <div className="-mx-6 -mt-6 px-6 pt-5 pb-5 bg-gradient-to-b from-gray-50 to-white dark:from-gray-750 dark:to-gray-800 border-b border-gray-100 dark:border-gray-700/50">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {initials}
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate leading-tight">
                  {fullSupplier.name}
                </h2>
                <div className="mt-1.5 space-y-1">
                  {fullSupplier.email && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{fullSupplier.email}</span>
                    </div>
                  )}
                  {fullSupplier.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{fullSupplier.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Context Menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1 animate-modal-content origin-top-right">
                    {onEdit && (
                      <button
                        onClick={() => {
                          onEdit(fullSupplier);
                          setMenuOpen(false);
                          onClose();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        {t("common.edit")}
                      </button>
                    )}
                    {onDelete && (
                      <>
                        <div className="my-1 border-t border-gray-100 dark:border-gray-700/50" />
                        <button
                          onClick={() => {
                            onDelete(fullSupplier);
                            setMenuOpen(false);
                            onClose();
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t("common.delete")}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Contact Person */}
        {fullSupplier.contact_person && (
          <div className="pt-4">
            <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">
              {t("suppliers.contactPerson")}
            </h3>
            <div className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl px-3.5 py-3">
              <User className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {fullSupplier.contact_person}
              </span>
            </div>
          </div>
        )}

        {/* Contact Information */}
        {fullSupplier.address && (
          <div className="pt-4">
            <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">
              {t("suppliers.contactInfo")}
            </h3>
            <div className="flex items-start justify-between gap-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl px-3.5 py-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {fullSupplier.address}
                </span>
              </div>
              <button
                onClick={handleCopyAddress}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-600/30 transition-colors shrink-0"
                title={t("suppliers.copyAddress")}
              >
                {addressCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Notes */}
        {fullSupplier.notes && (
          <div className="pt-4">
            <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">
              {t("suppliers.notes")}
            </h3>
            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl px-3.5 py-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {fullSupplier.notes}
              </p>
            </div>
          </div>
        )}

        {/* Member Since */}
        <div className="pt-4">
          <div className="flex items-center gap-2.5 text-sm">
            <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center">
              <Calendar className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                {t("suppliers.memberSince")}
              </span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {formatDate(fullSupplier.created_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Linked Products */}
        <div className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {t("suppliers.linkedProducts")}
            </h3>
            {fullSupplier.products && fullSupplier.products.length > 0 && (
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-1.5 py-0.5 rounded-md">
                {fullSupplier.products.length}
              </span>
            )}
          </div>
          {isLoadingFull ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : !fullSupplier.products || fullSupplier.products.length === 0 ? (
            <div className="text-center py-8 bg-gray-50/50 dark:bg-gray-700/20 rounded-xl">
              <Package className="h-8 w-8 text-gray-200 dark:text-gray-700 mx-auto mb-2.5" />
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t("suppliers.noProducts")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
              {fullSupplier.products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between py-3 first:pt-0 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 -mx-1.5 px-1.5 rounded-lg transition-colors cursor-default"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Package className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {product.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(product.sale_price_cents)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};
