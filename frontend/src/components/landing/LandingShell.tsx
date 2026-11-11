import { usePaddle } from "../../providers/PaddleProvider";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Moon, Sun, Menu, X } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
import { LoginModal } from "../auth/LoginModal";
import { RegisterModal } from "../auth/RegisterModal";
import { useTranslation } from "../../hooks/useTranslation";
import { useAuth } from "../../hooks/useAuth";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useTheme } from "../../contexts/useTheme";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { FooterSection } from "./FooterSection";

interface LandingShellProps {
  children:
    | React.ReactNode
    | ((props: { onOpenRegister: () => void }) => React.ReactNode);
}

export const LandingShell: React.FC<LandingShellProps> = ({ children }) => {
  const { t } = useTranslation();
  const { billingEnabled } = usePaddle();
  const { isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hash } = useLocation();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  useBodyScrollLock(isMobileMenuOpen);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Plain <a href="/#features"> links from other pages land here with a hash
  // the browser cannot resolve before React has rendered the sections. The jump
  // is "instant", not "auto": "auto" follows the stylesheet's `scroll-behavior: smooth`, and a
  // glide still running when fonts settle ends at a stale position. It is repeated once web
  // fonts settle, because they reflow the text above the target.
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const jumpToTarget = () =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    jumpToTarget();
    let isCancelled = false;
    void document.fonts.ready.then(() => {
      if (!isCancelled) jumpToTarget();
    });
    return () => {
      isCancelled = true;
    };
  }, [hash]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const closeBtn = mobileMenuRef.current?.querySelector<HTMLButtonElement>(
      ".landing-mobile-close",
    );
    closeBtn?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        return;
      }
      if (e.key === "Tab" && mobileMenuRef.current) {
        const focusable = mobileMenuRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      hamburgerRef.current?.focus();
    };
  }, [isMobileMenuOpen]);

  const openLoginModal = useCallback(() => {
    setIsRegisterModalOpen(false);
    setIsLoginModalOpen(true);
    setMobileMenuOpen(false);
  }, []);
  const openRegisterModal = useCallback(() => {
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(true);
    setMobileMenuOpen(false);
  }, []);
  const closeModals = useCallback(() => {
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(false);
  }, []);

  // Deep links such as the login screen's "Sign up here" open the modal directly.
  useEffect(() => {
    const authIntent = searchParams.get("auth");
    if (authIntent === "register") openRegisterModal();
    if (authIntent === "login") openLoginModal();
    if (authIntent) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, openRegisterModal, openLoginModal]);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <div className="landing-page">
      <nav
        className={`landing-nav ${scrolled ? "scrolled" : ""}`}
        aria-label={t("landing.nav.mainNavigation")}
      >
        <a href="/" className="landing-logo" aria-label="ReceiptMaster">
          <img src="/logo-icon.svg" alt="" className="landing-logo-icon" />
          <span className="landing-logo-name">
            receipt<em>master</em>
          </span>
        </a>

        <div className="landing-nav-pill">
          <a href="/#features">{t("landing.nav.features")}</a>
          <a href="/#how-it-works">{t("landing.nav.howItWorks")}</a>
          {billingEnabled && <a href="/#pricing">{t("landing.nav.pricing")}</a>}
          <a href="/blog">{t("landing.nav.blog")}</a>
        </div>

        <div className="landing-nav-right">
          <LanguageSwitcher compact />
          <button
            className="landing-theme-toggle"
            onClick={toggleTheme}
            aria-label={t("common.toggleTheme")}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="landing-nav-auth">
            {isAuthenticated ? (
              <a href="/dashboard" className="landing-btn-dark">
                {t("landing.goToDashboard")}
              </a>
            ) : (
              <>
                <button className="landing-btn-ghost" onClick={openLoginModal}>
                  {t("auth.login")}
                </button>
                <button
                  className="landing-btn-dark"
                  onClick={openRegisterModal}
                >
                  {t("auth.register")}
                </button>
              </>
            )}
          </div>
          <button
            ref={hamburgerRef}
            className="landing-hamburger"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("landing.nav.openMenu")}
            aria-expanded={isMobileMenuOpen}
          >
            <Menu size={24} />
          </button>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="landing-mobile-menu open"
          role="dialog"
          aria-modal="true"
          aria-label={t("landing.nav.mobileNavigation")}
        >
          <button
            className="landing-mobile-close"
            onClick={closeMobileMenu}
            aria-label={t("landing.nav.closeMenu")}
          >
            <X size={24} />
          </button>
          <a
            href="/#features"
            className="landing-mobile-menu-link"
            onClick={closeMobileMenu}
          >
            {t("landing.nav.features")}
          </a>
          <a
            href="/#how-it-works"
            className="landing-mobile-menu-link"
            onClick={closeMobileMenu}
          >
            {t("landing.nav.howItWorks")}
          </a>
          {billingEnabled && (
            <a
              href="/#pricing"
              className="landing-mobile-menu-link"
              onClick={closeMobileMenu}
            >
              {t("landing.nav.pricing")}
            </a>
          )}
          <a
            href="/blog"
            className="landing-mobile-menu-link"
            onClick={closeMobileMenu}
          >
            {t("landing.nav.blog")}
          </a>
          <div className="landing-mobile-menu-actions">
            {isAuthenticated ? (
              <a href="/dashboard" className="landing-btn-primary">
                {t("landing.goToDashboard")}
              </a>
            ) : (
              <>
                <button
                  className="landing-btn-primary"
                  onClick={openLoginModal}
                >
                  {t("auth.login")}
                </button>
                <button
                  className="landing-btn-secondary"
                  onClick={openRegisterModal}
                >
                  {t("auth.register")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {typeof children === "function"
        ? children({ onOpenRegister: openRegisterModal })
        : children}

      <FooterSection />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={closeModals}
        onSwitchToRegister={openRegisterModal}
      />
      <RegisterModal
        isOpen={isRegisterModalOpen}
        onClose={closeModals}
        onSwitchToLogin={openLoginModal}
      />
    </div>
  );
};
