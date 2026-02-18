import { type ReactNode } from 'react';
import { clsx } from 'clsx';

interface SidebarGroupProps {
  label?: string;
  isCollapsed: boolean;
  children: ReactNode;
}

export const SidebarGroup = ({ label, isCollapsed, children }: SidebarGroupProps) => {
  return (
    <div className="mb-1">
      {label && (
        <div
          className={clsx(
            'px-3 mb-1 transition-all duration-200',
            isCollapsed ? 'flex justify-center' : ''
          )}
        >
          {isCollapsed ? (
            <div className="w-5 h-px bg-gray-200 dark:bg-gray-700" />
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 select-none">
              {label}
            </span>
          )}
        </div>
      )}
      <ul className="space-y-0.5">
        {children}
      </ul>
    </div>
  );
};
