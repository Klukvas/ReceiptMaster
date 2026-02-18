interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
);

export const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <Skeleton className="h-4 w-24 mb-3" />
    <Skeleton className="h-8 w-32 mb-2" />
    <Skeleton className="h-3 w-20" />
  </div>
);

export const SkeletonChart = ({ height = 'h-48' }: { height?: string }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <Skeleton className="h-4 w-32 mb-4" />
    <Skeleton className={`w-full ${height}`} />
  </div>
);
