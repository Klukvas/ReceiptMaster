import React, { forwardRef, type ReactNode } from "react";
import { Card as BaseCard, cn } from "@klukvas/flux-b2c-ui";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  actions?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, title, actions, ...props }, ref) => (
    <BaseCard ref={ref} className={cn("p-6", className)} {...props}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between">
          {title && (
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {title}
            </h3>
          )}
          {actions && <div className="flex space-x-2">{actions}</div>}
        </div>
      )}
      {children}
    </BaseCard>
  ),
);

Card.displayName = "Card";
