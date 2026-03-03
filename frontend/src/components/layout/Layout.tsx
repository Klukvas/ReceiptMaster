import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../../hooks/useAuth";
import { useTranslation } from "../../hooks/useTranslation";
import { Sidebar } from "./Sidebar";
import { ReceiptProgressPanel } from "../receipts/ReceiptProgressPanel";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-surface-alt transition-colors duration-200">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-elevated/80 backdrop-blur-lg border-b border-[var(--color-border)] transition-colors duration-200">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors duration-150"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <img
              src="/image.png"
              alt="ReceiptMaster Logo"
              className="h-6 w-6 object-contain"
            />
            <span className="text-sm font-bold text-content tracking-tight">
              ReceiptMaster
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary hidden sm:block truncate max-w-[120px]">
              {user?.email}
            </span>
            <button
              onClick={logout}
              className="p-2 -mr-2 rounded-lg text-content-tertiary hover:text-danger-base hover:bg-[var(--color-danger-light)] transition-colors duration-150"
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
      <div
        className={clsx(
          "min-h-screen flex flex-col transition-all duration-300",
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]",
        )}
      >
        <main className="flex-1 py-6 pt-20 lg:pt-6 pb-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
        {/* Footer */}
        <footer className="border-t border-[var(--color-border)] py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-content-tertiary">
                &copy; {new Date().getFullYear()} ReceiptMaster.{""}
                {t("landing.footer.rights")} &middot; Powered by{""}
                <span className="font-semibold">fluxLab</span>
              </p>
              <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <Link
                  to="/terms"
                  className="text-xs text-content-tertiary hover:text-content-secondary transition-colors"
                >
                  {t("landing.footer.terms")}
                </Link>
                <Link
                  to="/privacy"
                  className="text-xs text-content-tertiary hover:text-content-secondary transition-colors"
                >
                  {t("landing.footer.privacy")}
                </Link>
                <Link
                  to="/refund-policy"
                  className="text-xs text-content-tertiary hover:text-content-secondary transition-colors"
                >
                  {t("landing.footer.refundPolicy")}
                </Link>
                <Link
                  to="/cookie-policy"
                  className="text-xs text-content-tertiary hover:text-content-secondary transition-colors"
                >
                  {t("landing.footer.cookiePolicy")}
                </Link>
                <a
                  href="mailto:fluxlab@flux-lab.dev"
                  className="text-xs text-content-tertiary hover:text-content-secondary transition-colors"
                >
                  {t("landing.footer.contact")}
                </a>
              </nav>
            </div>
          </div>
        </footer>

        <ReceiptProgressPanel />
      </div>
    </div>
  );
};
