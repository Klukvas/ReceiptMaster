import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const accentClasses =
  "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]";
const dangerClasses =
  "bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius,10px)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: accentClasses,
        primary: accentClasses,
        destructive: dangerClasses,
        danger: dangerClasses,
        outline:
          "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]",
        secondary:
          "bg-[var(--color-surface-alt)] text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]/80",
        ghost: "text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]",
        link: "text-[var(--color-accent)] underline-offset-4 hover:underline",
        success:
          "bg-[var(--color-success)] text-white hover:bg-[var(--color-success)]/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-[var(--radius,10px)] px-3",
        lg: "h-11 rounded-[var(--radius,10px)] px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading = false, disabled, children, ...props },
    ref,
  ) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, type ButtonProps };
