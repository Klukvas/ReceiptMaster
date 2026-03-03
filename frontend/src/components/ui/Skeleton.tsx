import { Skeleton as BaseSkeleton, cn } from "@klukvas/flux-b2c-ui";

interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className = "" }: SkeletonProps) => (
  <BaseSkeleton className={className} />
);

export const StatCardSkeleton = () => (
  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] p-6">
    <Skeleton className="mb-3 h-4 w-24" />
    <Skeleton className="mb-2 h-8 w-32" />
    <Skeleton className="h-3 w-20" />
  </div>
);

export const SkeletonChart = ({ height = "h-48" }: { height?: string }) => (
  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] p-6">
    <Skeleton className="mb-4 h-4 w-32" />
    <Skeleton className={cn("w-full", height)} />
  </div>
);
