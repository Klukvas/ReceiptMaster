import { type ReactNode } from "react";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { cn } from "../ui/primitives/cn";
import { useAfterDelay } from "../../hooks/useAfterDelay";

const SKELETON_DELAY_MS = 200;

/**
 * Keeps the space of the loaded content from the first frame but only paints it after a
 * short delay, so a fast response never flashes a skeleton and the layout never jumps.
 */
const DelayedSkeleton = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const isVisible = useAfterDelay(SKELETON_DELAY_MS);
  return (
    <div
      aria-hidden="true"
      data-testid="dashboard-skeleton"
      className={cn("h-full", className, !isVisible && "invisible")}
    >
      {children}
    </div>
  );
};

const Bone = ({ className }: { className: string }) => (
  <Skeleton className={cn("motion-reduce:animate-none", className)} />
);

/** Entity count card (icon + name + value): 102 px like StatCard without a description. */
export const EntityStatCardSkeleton = () => (
  <DelayedSkeleton>
    <Card>
      <div className="flex items-center">
        <Bone className="h-12 w-12 shrink-0 rounded-lg" />
        <div className="ml-4">
          <Bone className="h-5 w-20" />
          <Bone className="h-8 w-14" />
        </div>
      </div>
    </Card>
  </DelayedSkeleton>
);

/** Financial summary card: name, value, description and the footer slot of StatCard. */
export const FinancialStatCardSkeleton = () => (
  <DelayedSkeleton>
    <Card>
      <div className="flex items-center">
        <Bone className="h-12 w-12 shrink-0 rounded-lg" />
        <div className="ml-4">
          <Bone className="h-5 w-28" />
          <Bone className="h-8 w-36" />
          <Bone className="mt-0.5 h-4 w-40" />
          <div className="mt-1" />
        </div>
      </div>
    </Card>
  </DelayedSkeleton>
);

/** `hasFooter` reserves the slot KPIPrimaryCard gives to a profit-status note. */
export const KpiPrimarySkeleton = ({ hasFooter = true }: { hasFooter?: boolean }) => (
  <DelayedSkeleton>
    <div className="rounded-2xl border border-[var(--color-border)] bg-elevated p-6">
      <div className="mb-4 flex items-center justify-between">
        <Bone className="h-5 w-28" />
        <Bone className="h-10 w-10 rounded-xl" />
      </div>
      <Bone className="h-9 w-48 sm:h-10" />
      {hasFooter && <div className="mt-2" />}
    </div>
  </DelayedSkeleton>
);

export const KpiSecondarySkeleton = () => (
  <DelayedSkeleton>
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border-light)] bg-elevated px-4 py-3.5">
      <Bone className="h-8 w-8 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <Bone className="h-4 w-20" />
        <Bone className="h-7 w-24" />
      </div>
    </div>
  </DelayedSkeleton>
);

/** Low-stock card with the two product rows it usually shows. */
export const LowStockSkeleton = () => (
  <DelayedSkeleton>
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <Bone className="h-4 w-4" />
        <Bone className="h-5 w-24" />
      </div>
      <div className="space-y-2">
        <Bone className="h-9 w-full" />
        <Bone className="h-9 w-full" />
      </div>
    </Card>
  </DelayedSkeleton>
);

/** Title + 200 px plot of the home charts (sparkline, status donut). */
export const HomeChartSkeleton = ({ headerClassName = "h-5" }: { headerClassName?: string }) => (
  <DelayedSkeleton>
    <Card>
      <div className="mb-4 flex items-center">
        <Bone className={cn("w-40", headerClassName)} />
      </div>
      <Bone className="h-[200px] w-full" />
    </Card>
  </DelayedSkeleton>
);

/** Plot card of the analytics bar charts (title + 250 px minimum plot). */
export const AnalyticsChartSkeleton = () => (
  <DelayedSkeleton>
    <div className="rounded-2xl border border-[var(--color-border-light)] bg-elevated p-5">
      <Bone className="mb-5 h-5 w-40" />
      <Bone className="h-[250px] w-full" />
    </div>
  </DelayedSkeleton>
);

/** Rows of the "Latest ..." cards at their real height. */
export const LatestRowsSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <DelayedSkeleton>
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Bone key={index} className="h-16 w-full" />
      ))}
    </div>
  </DelayedSkeleton>
);
