import { Link, useLocation } from 'react-router-dom';
import { Package, Users, ShoppingCart, Home, LogOut, X, Settings, BarChart3, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { useTranslation } from '../../hooks/useTranslation';

interface SidebarProps {
  isOpen: boolean;       // mobile drawer open/close
  isCollapsed: boolean;  // desktop collapsed/expanded
  onToggle: () => void;
  onClose: () => void;
}

  const navigation = [
    { nameKey: 'navigation.dashboard', href: '/dashboard', icon: Home },
    { nameKey: 'navigation.products', href: '/products', icon: Package },
    { nameKey: 'navigation.recipients', href: '/recipients', icon: Users },
    { nameKey: 'navigation.orders', href: '/orders', icon: ShoppingCart },
    { nameKey: 'navigation.analytics', href: '/analytics', icon: BarChart3 },
    { nameKey: 'navigation.profile', href: '/profile', icon: User },
    { nameKey: 'navigation.settings', href: '/settings', icon: Settings },
  ];

export const Sidebar = ({ isOpen, isCollapsed, onToggle, onClose }: SidebarProps) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const initials = user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 backdrop-blur-sm bg-black/20 dark:bg-black/40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 bottom-0 left-0 z-50 h-screen bg-white dark:bg-gray-800 shadow-lg transform transition-all duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          isCollapsed ? 'lg:w-16' : 'lg:w-64'
        )}
        aria-label="Sidebar"
      >
         {/* Header / Brand + toggles */}
         <div
           className={clsx(
             'border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out',
             isCollapsed ? 'px-2 py-3' : 'px-4 py-4'
           )}
         >
           {isCollapsed ? (
             // Collapsed layout: logo on top, toggle button below
             <div className="flex flex-col items-center space-y-3">
               <img
                 src="/image.png"
                 alt="Logo"
                 className="h-8 w-8 object-contain flex-shrink-0"
               />
               <button
                 onClick={onToggle}
                 className="hidden lg:flex p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 ease-in-out hover:scale-105"
                 title="Expand sidebar"
                 aria-label="Expand sidebar"
               >
                 <ChevronRight className="h-5 w-5 transition-transform duration-200 ease-in-out" />
               </button>
             </div>
           ) : (
             // Expanded layout: logo and title on left, toggle button on right
             <div className="flex h-16 items-center justify-between transition-all duration-300 ease-in-out">
               <div className="flex items-center space-x-3 transition-all duration-300 ease-in-out">
                 <img
                   src="/image.png"
                   alt="Logo"
                   className="h-8 w-8 object-contain flex-shrink-0 transition-all duration-300 ease-in-out"
                 />
                 <h1 className="text-xl font-bold text-gray-900 dark:text-white transition-all duration-300 ease-in-out">
                   ReceiptMaster
                 </h1>
               </div>

               <div className="flex items-center gap-2">
                 {/* Desktop collapse/expand */}
                 <button
                   onClick={onToggle}
                   className="hidden lg:flex p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 ease-in-out hover:scale-105"
                   title="Collapse sidebar"
                   aria-label="Collapse sidebar"
                 >
                   <ChevronLeft className="h-5 w-5 transition-transform duration-200 ease-in-out" />
                 </button>

                 {/* Mobile close */}
                 <button
                   onClick={onClose}
                   className="lg:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                   aria-label="Close sidebar"
                 >
                   <X className="h-5 w-5" />
                 </button>
               </div>
             </div>
           )}
         </div>

        {/* 3-block layout */}
        <div className="grid grid-rows-[auto,1fr,auto] h-[calc(100vh-4rem)] min-h-0">
           {/* 1) User profile (top) */}
           <div
             className={clsx(
               'row-start-1 border-gray-200 dark:border-gray-700 py-3 transition-all duration-300 ease-in-out',
               isCollapsed ? 'px-2' : 'px-4'
             )}
           >
             <Link
               to="/profile"
               onClick={onClose}
               className={clsx('flex items-center transition-all duration-300 ease-in-out hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 -m-2', isCollapsed ? 'justify-center' : 'gap-3')}
             >
               <div className="w-9 h-9 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm font-medium text-gray-700 dark:text-gray-200 flex-shrink-0 transition-all duration-300 ease-in-out hover:scale-105">
                 {initials || '🧑'}
               </div>

               {/* Hide details in collapsed */}
               <div
                 className={clsx(
                   'min-w-0 overflow-hidden transition-all duration-300 ease-in-out',
                   isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                 )}
               >
                 <p className="text-sm font-semibold text-gray-900 dark:text-white truncate transition-all duration-300 ease-in-out">
                   {user?.email}
                 </p>
               </div>
             </Link>
           </div>

           {/* 2) Navigation (middle, sticks to top below profile) */}
           <nav className={clsx(
             'row-start-2 min-h-0 transition-all duration-300 ease-in-out',
             isCollapsed ? '' : 'overflow-y-auto'
           )}>
             <ul className={clsx('py-3 transition-all duration-300 ease-in-out', isCollapsed ? 'px-2' : 'px-3 space-y-1')}>
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.nameKey} className="relative group">
                    <Link
                      to={item.href}
                      onClick={onClose}
                      className={clsx(
                        'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-in-out hover:scale-105',
                        isCollapsed ? 'justify-center' : '',
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-r-2 border-blue-700 dark:border-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                      )}
                      title={isCollapsed ? t(item.nameKey) : ''}
                    >
                      <item.icon className={clsx('h-5 w-5 transition-all duration-200 ease-in-out', isCollapsed ? 'mr-0' : 'mr-3')} />
                      <span
                        className={clsx(
                          'overflow-hidden transition-all duration-300 ease-in-out',
                          isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                        )}
                      >
                        {t(item.nameKey)}
                      </span>
                    </Link>

                    {/* Tooltip when collapsed */}
                    {isCollapsed && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 pointer-events-none rounded px-2 py-1 text-xs text-white bg-gray-900 dark:bg-gray-700 opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 transition-all duration-200 ease-in-out transform group-hover:scale-105">
                        {t(item.nameKey)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

           {/* 3) Settings (bottom, always pinned & within viewport) */}
           <div
             className={clsx(
               'row-start-3 flex flex-col justify-end border-gray-200 dark:border-gray-700 pb-11 transition-all duration-300 ease-in-out',
               isCollapsed ? 'p-1' : 'p-2'
             )}
           >

            {/* Theme & Language */}
            {!isCollapsed && (
              <>
                <div className="mt-1.5 flex items-center justify-between rounded-md px-2 py-1.5">
                  <ThemeToggle />
                </div>
                <div className="mt-1 flex items-center justify-between rounded-md px-2 py-1.5">
                  <LanguageSwitcher />
                </div>
              </>
            )}

            {/* Logout — icon only when collapsed */}
            <button
              onClick={logout}
              className={clsx(
                'mt-1 w-full rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 ease-in-out hover:scale-105',
                isCollapsed ? 'flex justify-center p-2' : 'flex items-center px-2 py-2'
              )}
              title={isCollapsed ? t('auth.logout') : ''}
              aria-label={t('auth.logout')}
            >
              <LogOut className={clsx('h-4 w-4 flex-shrink-0 transition-all duration-200 ease-in-out', isCollapsed ? 'mr-0' : 'mr-2')} />
              <span
                className={clsx(
                  'overflow-hidden transition-all duration-300 ease-in-out',
                  isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                )}
              >
                {t('auth.logout')}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};