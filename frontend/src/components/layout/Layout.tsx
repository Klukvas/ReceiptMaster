import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../../hooks/useAuth";
import { useTranslation } from "../../hooks/useTranslation";
import { Sidebar } from "./Sidebar";
import { OfflineBanner } from "./OfflineBanner";
import { ReceiptProgressPanel } from "../receipts/ReceiptProgressPanel";

interface LayoutProps {
  children: ReactNode;
}

const MAIN_CONTENT_ID = "main-content";

/**
 * Module-level, not a ref: most routes share one Layout, but some (e.g. /documents) mount
 * their own, and a navigation there must still count as one.
 */
let lastShownPathname: string | null = null;

/**
 * Focuses <main> without leaving it focusable: a permanent tabIndex would let a click on any text
 * inside the page focus <main>, and a dialog opened by that click would then return focus there
 * instead of to the control the user reached it from.
 */
const focusMain = (main: HTMLElement) => {
  main.setAttribute("tabindex", "-1");
  main.addEventListener("blur", () => main.removeAttribute("tabindex"), {
    once: true,
  });
  focusMain(main);
};

/**
 * After a navigation, focus moves to the new page instead of staying on the sidebar link.
 * It is left alone when a dialog holds it, or when the page already focused one of its fields.
 */
const focusMainAfterNavigation = (main: HTMLElement | null) => {
  if (!main) return;
  const active = document.activeElement;
  const isInDialog =
    active instanceof Element && active.closest('[role="dialog"]') !== null;
  const isInPage = active !== main && main.contains(active);
  if (isInDialog || isInPage || document.querySelector('[aria-modal="true"]'))
    return;
  main.focus({ preventScroll: true });
};

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const previous = lastShownPathname;
    lastShownPathname = pathname;
    // Not on the first page load: that keeps the browser's own focus.
    if (previous !== null && previous !== pathname)
      focusMainAfterNavigation(mainRef.current);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-surface-alt transition-colors duration-200">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        onClick={(event) => {
          // Moving focus is the point; a hash in the URL would only confuse the router.
          event.preventDefault();
          if (mainRef.current) focusMain(mainRef.current);
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-elevated focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-content focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
      >
        {t("common.skipToContent")}
      </a>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-elevated/80 pt-[env(safe-area-inset-top)] backdrop-blur-lg border-b border-[var(--color-border)] transition-colors duration-200 motion-reduce:transition-none">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label={t("common.openSidebar")}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            className="p-2 pointer-coarse:p-3 -ml-2 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors duration-150"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <img src="/logo-icon.svg" alt="receiptmaster" className="h-7 w-7" />
            <span className="text-sm font-bold text-content tracking-tight">
              receiptmaster
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary hidden sm:block truncate max-w-[120px]">
              {user?.email}
            </span>
            <button
              onClick={logout}
              className="p-2 pointer-coarse:p-3.5 -mr-2 rounded-lg text-content-tertiary hover:text-danger-base hover:bg-[var(--color-danger-light)] transition-colors duration-150"
              title={t("auth.logout")}
              aria-label={t("auth.logout")}
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
          "min-h-screen flex flex-col transition-all duration-300 motion-reduce:transition-none",
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]",
        )}
      >
        <main
          ref={mainRef}
          id={MAIN_CONTENT_ID}
          className="flex-1 py-6 pt-[calc(5rem+env(safe-area-inset-top))] lg:pt-6 pb-8 focus:outline-none"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <OfflineBanner />
            {children}
          </div>
        </main>
        {/* Footer */}
        <footer className="border-t border-[var(--color-border)] py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-content-tertiary">
                &copy; {new Date().getFullYear()} receiptmaster.org
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
