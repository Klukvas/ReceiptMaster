import React, { useState } from 'react';
import { 
  Package, 
  Users, 
  ShoppingCart, 
  Receipt, 
  BarChart3, 
  CheckCircle, 
  ArrowRight,
  Star,
  Shield,
  Zap,
  Globe,
  Smartphone,
  CreditCard,
  FileText,
  TrendingUp
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { LoginModal } from '../components/auth/LoginModal';
import { RegisterModal } from '../components/auth/RegisterModal';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';

export const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const openLoginModal = () => {
    setIsRegisterModalOpen(false);
    setIsLoginModalOpen(true);
  };

  const openRegisterModal = () => {
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(true);
  };

  const closeModals = () => {
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(false);
  };

  const features = [
    {
      icon: Package,
      title: t('landing.features.products.title'),
      description: t('landing.features.products.description'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      icon: Users,
      title: t('landing.features.recipients.title'),
      description: t('landing.features.recipients.description'),
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      icon: ShoppingCart,
      title: t('landing.features.orders.title'),
      description: t('landing.features.orders.description'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      icon: Receipt,
      title: t('landing.features.receipts.title'),
      description: t('landing.features.receipts.description'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
    {
      icon: BarChart3,
      title: t('landing.features.analytics.title'),
      description: t('landing.features.analytics.description'),
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    },
    {
      icon: Shield,
      title: t('landing.features.security.title'),
      description: t('landing.features.security.description'),
      color: 'text-red-600',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
  ];

  const benefits = [
    t('landing.benefits.easy'),
    t('landing.benefits.fast'),
    t('landing.benefits.secure'),
    t('landing.benefits.multilingual'),
    t('landing.benefits.responsive'),
    t('landing.benefits.realTime'),
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <img
                src="/image.png"
                alt="ReceiptMaster Logo"
                className="h-8 w-8 object-contain"
              />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                ReceiptMaster
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <LanguageSwitcher />
              {isAuthenticated ? (
                <>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {t('landing.welcome')}, {user?.email?.split('@')[0]}!
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.location.href = '/dashboard'}>
                    {t('landing.goToDashboard')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={logout}>
                    {t('auth.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={openLoginModal}>
                    {t('auth.login')}
                  </Button>
                  <Button size="sm" onClick={openRegisterModal}>
                    {t('auth.register')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              {isAuthenticated ? t('landing.hero.welcomeBack') : t('landing.hero.title')}
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
              {isAuthenticated ? t('landing.hero.welcomeBackSubtitle') : t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <>
                  <Button size="lg" className="bg-white flex flex-row items-center justify-center text-blue-600 hover:bg-gray-100 text-lg px-8 py-3" onClick={() => window.location.href = '/dashboard'}>
                    {t('landing.hero.goToDashboard')}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-3" onClick={logout}>
                    {t('auth.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-3" onClick={openRegisterModal}>
                    {t('landing.hero.getStarted')}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-3" onClick={openLoginModal}>
                    {t('landing.hero.login')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('landing.features.title')}
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                <div className={`w-12 h-12 ${feature.bgColor} rounded-lg flex items-center justify-center mb-4`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                {t('landing.benefits.title')}
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                {t('landing.benefits.subtitle')}
              </p>
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center">
                    <CheckCircle className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-6 text-white">
                <TrendingUp className="h-8 w-8 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('landing.stats.revenue')}</h3>
                <p className="text-blue-100">{t('landing.stats.revenueDesc')}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-teal-600 rounded-lg p-6 text-white">
                <FileText className="h-8 w-8 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('landing.stats.receipts')}</h3>
                <p className="text-green-100">{t('landing.stats.receiptsDesc')}</p>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-lg p-6 text-white">
                <Smartphone className="h-8 w-8 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('landing.stats.mobile')}</h3>
                <p className="text-orange-100">{t('landing.stats.mobileDesc')}</p>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg p-6 text-white">
                <Globe className="h-8 w-8 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('landing.stats.global')}</h3>
                <p className="text-indigo-100">{t('landing.stats.globalDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            {isAuthenticated ? t('landing.cta.welcomeBackTitle') : t('landing.cta.title')}
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            {isAuthenticated ? t('landing.cta.welcomeBackSubtitle') : t('landing.cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <>
                <Button size="lg" className="bg-white flex flex-row items-center justify-center text-blue-600 hover:bg-gray-100 text-lg px-8 py-3" onClick={() => window.location.href = '/dashboard'}>
                  {t('landing.cta.goToDashboard')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-3" onClick={logout}>
                  {t('auth.logout')}
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-3" onClick={openRegisterModal}>
                  {t('landing.cta.startFree')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-3" onClick={openLoginModal}>
                  {t('landing.cta.login')}
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-3 mb-4">
                <img
                  src="/image.png"
                  alt="ReceiptMaster Logo"
                  className="h-8 w-8 object-contain"
                />
                <h3 className="text-xl font-bold">ReceiptMaster</h3>
              </div>
              <p className="text-gray-400 mb-4">
                {t('landing.footer.description')}
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">{t('landing.footer.product')}</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.features')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.pricing')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.support')}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">{t('landing.footer.company')}</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.about')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.contact')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.privacy')}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 ReceiptMaster. {t('landing.footer.rights')}</p>
          </div>
        </div>
      </footer>

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
