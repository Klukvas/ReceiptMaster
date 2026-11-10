import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { LatestRowsSkeleton } from "./DashboardSkeletons";
import { QueryErrorState } from "./QueryErrorState";
import { useTranslation } from "../../hooks/useTranslation";

interface LinkTarget {
  label: string;
  to: string;
}

interface LatestListCardProps {
  title: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Rendered rows; an empty list shows the empty state, but only once loaded. */
  rows: ReactNode[];
  emptyIcon: LucideIcon;
  emptyMessage: string;
  emptyAction: LinkTarget;
  viewAll: LinkTarget;
}

/** One row of a "Latest ..." card; 64 px tall like its skeleton. */
export const LatestRow = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 p-3 bg-surface-alt rounded-lg">
    {children}
  </div>
);

export const LatestListCard = ({
  title,
  isLoading,
  isError,
  onRetry,
  rows,
  emptyIcon: EmptyIcon,
  emptyMessage,
  emptyAction,
  viewAll,
}: LatestListCardProps) => {
  const { t } = useTranslation();
  const renderBody = () => {
    if (isLoading) return <LatestRowsSkeleton />;
    if (isError) return (
        <QueryErrorState
          onRetry={onRetry}
          message={t("dashboard.widgetLoadError", "Could not load this section")}
        />
      );
    if (rows.length === 0) {
      return (
        <div className="text-center py-8">
          <EmptyIcon className="h-12 w-12 text-content-tertiary mx-auto mb-4" />
          <p className="text-content-tertiary mb-4">{emptyMessage}</p>
          <Link to={emptyAction.to}>
            <Button>{emptyAction.label}</Button>
          </Link>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {rows}
        {/* Block, so the link's own box is the button's full (touch-sized) height. */}
        <Link to={viewAll.to} className="block">
          <Button variant="outline" className="w-full mt-4">
            {viewAll.label}
          </Button>
        </Link>
      </div>
    );
  };

  return <Card title={title}>{renderBody()}</Card>;
};
