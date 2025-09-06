import { type ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  actions?: ReactNode;
}

export const Card = ({ children, className, title, actions }: CardProps) => {
  return (
    <div className={clsx('bg-white rounded-lg shadow-sm border border-gray-200 p-6', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          )}
          {actions && <div className="flex space-x-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
