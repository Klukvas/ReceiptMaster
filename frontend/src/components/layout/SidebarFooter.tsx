import { LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

interface SidebarFooterProps {
  isCollapsed: boolean;
  logoutLabel: string;
  onLogout: () => void;
}

export const SidebarFooter = ({ isCollapsed, logoutLabel, onLogout }: SidebarFooterProps) => {
  return (
    <div className={clsx('px-3 pb-4 pt-2', isCollapsed ? 'px-2' : '')}>
      {/* Divider */}
      <div className={clsx('mb-3', isCollapsed ? 'mx-1' : 'mx-1')}>
        <div className="h-px bg-gray-100 dark:bg-gray-700/50" />
      </div>

      {/* Theme & Language – hidden when collapsed */}
      {!isCollapsed && (
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between px-2 py-1">
            <ThemeToggle />
          </div>
          <div className="px-2 py-1">
            <LanguageSwitcher />
          </div>
        </div>
      )}

      {/* Logout button */}
      <button
        onClick={onLogout}
        className={clsx(
          'w-full rounded-lg text-sm font-medium transition-all duration-150 group',
          'text-gray-500 dark:text-gray-400',
          'hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10',
          isCollapsed ? 'flex justify-center p-2.5 mx-1' : 'flex items-center px-3 py-2.5 mx-0'
        )}
        title={isCollapsed ? logoutLabel : undefined}
        aria-label={logoutLabel}
      >
        <LogOut className={clsx(
          'h-[18px] w-[18px] flex-shrink-0 transition-colors duration-150',
          'text-gray-400 dark:text-gray-500 group-hover:text-red-500 dark:group-hover:text-red-400'
        )} />
        {!isCollapsed && (
          <span className="ml-3">{logoutLabel}</span>
        )}
      </button>

      {/* Collapsed tooltips for footer items */}
      {isCollapsed && (
        <div className="relative group mt-1">
          {/* Theme & Language collapsed tooltips handled via title attr */}
        </div>
      )}
    </div>
  );
};
