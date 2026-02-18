import { type ReactNode, useState } from 'react';
import { Menu, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { Sidebar } from './Sidebar';
import { ReceiptProgressPanel } from '../receipts/ReceiptProgressPanel';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200/80 dark:border-gray-800 transition-colors duration-200">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-150"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <img
              src="/image.png"
              alt="ReceiptMaster Logo"
              className="h-6 w-6 object-contain"
            />
            <span className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">
              ReceiptMaster
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block truncate max-w-[120px]">
              {user?.email}
            </span>
            <button
              onClick={logout}
              className="p-2 -mr-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-150"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <div className={clsx(
        'transition-all duration-300',
        sidebarCollapsed ? 'lg:pl-[68px]' : 'lg:pl-[260px]'
      )}>
        <main className="py-6 pt-20 lg:pt-6 pb-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
        <ReceiptProgressPanel />
      </div>
    </div>
  );
};
