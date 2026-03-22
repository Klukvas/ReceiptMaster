import { useLocation } from "react-router-dom";
import {
  Package,
  Users,
  ShoppingCart,
  Home,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
  Truck,
} from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../../hooks/useAuth";
import { useTranslation } from "../../hooks/useTranslation";
import { SidebarGroup } from "./SidebarGroup";
import { SidebarItem } from "./SidebarItem";
import { SidebarUser } from "./SidebarUser";
import { SidebarFooter } from "./SidebarFooter";

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const navigationGroups = [
  {
    labelKey: "navigation.groupMain",
    items: [
      { nameKey: "navigation.dashboard", href: "/dashboard", icon: Home },
      { nameKey: "navigation.orders", href: "/orders", icon: ShoppingCart },
      { nameKey: "navigation.recipients", href: "/recipients", icon: Users },
      { nameKey: "navigation.products", href: "/products", icon: Package },
      { nameKey: "navigation.suppliers", href: "/suppliers", icon: Truck },
    ],
  },
  {
    labelKey: "navigation.groupInsights",
    items: [
      { nameKey: "navigation.analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    labelKey: "navigation.groupSystem",
    items: [
      { nameKey: "navigation.settings", href: "/settings", icon: Settings },
    ],
  },
];

export const Sidebar = ({
  isOpen,
  isCollapsed,
  onToggle,
  onClose,
}: SidebarProps) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 backdrop-blur-sm bg-[var(--color-overlay)] transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-0 bottom-0 left-0 z-50 h-screen flex flex-col",
          "bg-elevated",
          "border-r border-[var(--color-border)]",
          "transform transition-all duration-300 ease-in-out",
          // Mobile slide
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          // Width
          isCollapsed ? "lg:w-[68px]" : "lg:w-[260px]",
          // Mobile always expanded
          "w-[280px]",
        )}
        aria-label="Sidebar"
      >
        {/* Header / Brand */}
        <div
          className={clsx(
            "flex-shrink-0 border-b border-[var(--color-border-light)]",
            isCollapsed ? "px-3 py-4" : "px-4 py-4",
          )}
        >
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              <span className="text-lg font-bold text-content tracking-tight">
                R
              </span>
              <button
                onClick={onToggle}
                className="hidden lg:flex p-1.5 rounded-md text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors duration-150"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-lg font-semibold text-content tracking-tight">
                  receiptmaster
                </span>
                <span className="text-[10px] text-content-tertiary -mt-0.5">
                  receiptmaster.org
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggle}
                  className="hidden lg:flex p-1.5 rounded-md text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors duration-150"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="lg:hidden p-1.5 rounded-md text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors duration-150"
                  aria-label="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User profile */}
        <SidebarUser
          email={user?.email}
          isCollapsed={isCollapsed}
          onClick={onClose}
        />

        {/* Navigation groups */}
        <nav
          className={clsx(
            "flex-1 min-h-0 py-2",
            isCollapsed ? "" : "overflow-y-auto",
          )}
        >
          {navigationGroups.map((group) => (
            <SidebarGroup
              key={group.labelKey}
              label={t(group.labelKey)}
              isCollapsed={isCollapsed}
            >
              {group.items.map((item) => (
                <SidebarItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={t(item.nameKey)}
                  isActive={location.pathname === item.href}
                  isCollapsed={isCollapsed}
                  onClick={onClose}
                />
              ))}
            </SidebarGroup>
          ))}
        </nav>

        {/* Footer */}
        <SidebarFooter
          isCollapsed={isCollapsed}
          logoutLabel={t("auth.logout")}
          onLogout={logout}
        />
      </aside>
    </>
  );
};
