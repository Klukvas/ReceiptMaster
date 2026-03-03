import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { productsApi } from "../../lib/api";
import { Card } from "../ui/Card";
import { StatCardSkeleton } from "../ui/Skeleton";
import { useTranslation } from "../../hooks/useTranslation";

const stockBadge = (qty: number) => {
  if (qty === 0) return "bg-[var(--color-danger-light)] text-danger-base";
  if (qty <= 5) return "bg-[var(--color-warning-light)] text-warning-base";
  return "bg-[var(--color-warning-light)] text-warning-base";
};

export const LowStockWidget = () => {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["lowStockProducts"],
    queryFn: () => productsApi.getLowStock(10),
  });

  if (isLoading) return <StatCardSkeleton />;

  const products = data?.data || [];

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-4 w-4 text-warning-base" />
        <h3 className="text-sm font-medium text-content-secondary">
          {t("dashboard.lowStock", "Low Stock")}
        </h3>
      </div>
      {products.length === 0 ? (
        <div className="text-center py-6 text-sm text-content-tertiary">
          {t("dashboard.allStocked", "All products are well-stocked")}
        </div>
      ) : (
        <div className="space-y-2">
          {products.slice(0, 5).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-alt"
            >
              <span className="text-sm font-medium text-content truncate mr-2">
                {p.name}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${stockBadge(p.quantity)}`}
              >
                {p.quantity} {t("dashboard.pcs", "pcs")}
              </span>
            </div>
          ))}
          {products.length > 5 && (
            <Link
              to="/products"
              className="block text-center text-xs text-accent-base hover:underline pt-1"
            >
              {t("dashboard.viewAll", "View all")} ({products.length})
            </Link>
          )}
        </div>
      )}
    </Card>
  );
};
