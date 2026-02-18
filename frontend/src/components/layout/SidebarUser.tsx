import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

interface SidebarUserProps {
  email: string | undefined;
  isCollapsed: boolean;
  onClick?: () => void;
}

export const SidebarUser = ({ email, isCollapsed, onClick }: SidebarUserProps) => {
  const initials = email?.[0]?.toUpperCase() || 'U';

  return (
    <div className={clsx('px-3 py-3', isCollapsed ? 'px-2' : '')}>
      <Link
        to="/profile"
        onClick={onClick}
        className={clsx(
          'flex items-center rounded-xl transition-all duration-150',
          'bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/8',
          isCollapsed ? 'justify-center p-2' : 'gap-3 p-2.5'
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-primary-500/10 dark:bg-primary-500/20 flex items-center justify-center text-sm font-semibold text-primary-600 dark:text-primary-400 flex-shrink-0">
          {initials}
        </div>

        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {email}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Personal account
            </p>
          </div>
        )}
      </Link>
    </div>
  );
};
