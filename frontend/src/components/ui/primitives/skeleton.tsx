import * as React from 'react';
import { cn } from './cn';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'none';
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'rectangular', width, height, animation = 'pulse', style, ...props }, ref) => {
    const variantClasses = {
      text: 'h-4 rounded',
      circular: 'rounded-full',
      rectangular: 'rounded-[var(--radius,10px)]',
    };

    const animationClasses = {
      pulse: 'animate-pulse',
      none: '',
    };

    const mergedStyle: React.CSSProperties = {
      ...style,
      width: width != null ? (typeof width === 'number' ? `${width}px` : width) : undefined,
      height: height != null ? (typeof height === 'number' ? `${height}px` : height) : undefined,
    };

    return (
      <div
        ref={ref}
        className={cn(
          'bg-[var(--color-surface-alt)]',
          variantClasses[variant],
          animationClasses[animation],
          className,
        )}
        style={mergedStyle}
        aria-hidden="true"
        {...props}
      />
    );
  },
);
Skeleton.displayName = 'Skeleton';

/* ------------------------------------------------------------------ */
/*  SkeletonText                                                       */
/* ------------------------------------------------------------------ */

interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

const SkeletonText = React.forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ lines = 1, className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" className="h-4" />
      ))}
    </div>
  ),
);
SkeletonText.displayName = 'SkeletonText';

/* ------------------------------------------------------------------ */
/*  SkeletonCard                                                       */
/* ------------------------------------------------------------------ */

const SkeletonCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 space-y-4', className)} {...props}>
    <div className="flex items-center space-x-4">
      <Skeleton variant="circular" width={40} height={40} />
      <div className="space-y-2 flex-1">
        <Skeleton variant="text" className="h-4 w-3/4" />
        <Skeleton variant="text" className="h-4 w-1/2" />
      </div>
    </div>
    <Skeleton variant="text" className="h-4" />
    <Skeleton variant="text" className="h-4 w-5/6" />
  </div>
));
SkeletonCard.displayName = 'SkeletonCard';

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  type SkeletonProps,
  type SkeletonTextProps,
};
