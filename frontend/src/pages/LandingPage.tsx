import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { LoginModal } from '../components/auth/LoginModal';
import { RegisterModal } from '../components/auth/RegisterModal';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { HeroSection } from '../components/landing/HeroSection';
import { TrustSection } from '../components/landing/TrustSection';
import { FeaturesSection } from '../components/landing/FeaturesSection';
import { DifferentiatorsSection } from '../components/landing/DifferentiatorsSection';
import { CTASection } from '../components/landing/CTASection';
import { FooterSection } from '../components/landing/FooterSection';

export const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openLoginModal = useCallback(() => {
    setIsRegisterModalOpen(false);
    setIsLoginModalOpen(true);
  }, []);

  const openRegisterModal = useCallback(() => {
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(true);
  }, []);

  const closeModals = useCallback(() => {
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled
            ? 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200/60 dark:border-gray-800/60 shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2.5 group"
            >
              <img
                src="/image.png"
                alt="ReceiptMaster"
                className="h-8 w-8 object-contain"
              />
              <span className="hidden sm:inline text-lg font-semibold text-gray-900 dark:text-white">
                ReceiptMaster
              </span>
            </button>

            {/* Right actions */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ThemeToggle compact />
              <LanguageSwitcher compact />

              {isAuthenticated ? (
                <>
                  <span className="hidden lg:inline text-sm text-gray-500 dark:text-gray-400 ml-2">
                    {user?.email?.split('@')[0]}
                  </span>
                  <Button
                    size="sm"
                    className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium ml-1 inline-flex items-center gap-1.5"
                    onClick={() => window.location.href = '/dashboard'}
                  >
                    {t('landing.goToDashboard')}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openLoginModal}
                    className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg font-medium ml-1"
                  >
                    {t('auth.login')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={openRegisterModal}
                    className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium"
                  >
                    {t('auth.register')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page sections */}
      <HeroSection onOpenRegister={openRegisterModal} />
      <TrustSection />
      <FeaturesSection />
      <DifferentiatorsSection />
      <CTASection onOpenRegister={openRegisterModal} />
      <FooterSection />

      {/* Auth Modals */}
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
