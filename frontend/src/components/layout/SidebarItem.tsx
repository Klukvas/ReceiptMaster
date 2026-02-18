import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { type LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  isCollapsed: boolean;
  onClick?: () => void;
}

export const SidebarItem = ({ href, icon: Icon, label, isActive, isCollapsed, onClick }: SidebarItemProps) => {
  return (
    <li className="relative group">
      <Link
        to={href}
        onClick={onClick}
        className={clsx(
          'flex items-center rounded-lg text-sm font-medium transition-all duration-150 relative',
          isCollapsed ? 'justify-center mx-1 px-0 py-2.5' : 'mx-2 px-3 py-2.5',
          isActive
            ? 'bg-primary-500/10 dark:bg-primary-500/15 text-primary-600 dark:text-primary-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'
        )}
      >
        {/* Left accent bar for active state */}
        {isActive && (
          <div
            className={clsx(
              'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-primary-500 transition-all duration-200',
              isCollapsed ? 'h-5' : 'h-6'
            )}
          />
        )}

        <Icon
          className={clsx(
            'h-[20px] w-[20px] flex-shrink-0 transition-colors duration-150',
            isActive
              ? 'text-primary-500 dark:text-primary-400'
              : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'
          )}
        />

        {!isCollapsed && (
          <span className="ml-3 truncate">{label}</span>
        )}
      </Link>

      {/* Tooltip when collapsed */}
      {isCollapsed && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
          <div className="px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-md shadow-lg whitespace-nowrap">
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[5px] border-r-gray-900 dark:border-r-gray-700" />
          </div>
        </div>
      )}
    </li>
  );
};
