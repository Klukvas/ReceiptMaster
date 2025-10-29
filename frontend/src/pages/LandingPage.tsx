import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, 
  Users, 
  ShoppingCart, 
  Receipt, 
  BarChart3, 
  CheckCircle, 
  ArrowRight,
  Shield,
  Globe,
  Smartphone,
  FileText,
  TrendingUp,
  Sparkles,
  Zap,
  Star
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
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      gradient: 'from-blue-500 to-cyan-500',
      glow: 'shadow-blue-500/50',
    },
    {
      icon: Users,
      title: t('landing.features.recipients.title'),
      description: t('landing.features.recipients.description'),
      gradient: 'from-green-500 to-emerald-500',
      glow: 'shadow-green-500/50',
    },
    {
      icon: ShoppingCart,
      title: t('landing.features.orders.title'),
      description: t('landing.features.orders.description'),
      gradient: 'from-purple-500 to-pink-500',
      glow: 'shadow-purple-500/50',
    },
    {
      icon: Receipt,
      title: t('landing.features.receipts.title'),
      description: t('landing.features.receipts.description'),
      gradient: 'from-orange-500 to-red-500',
      glow: 'shadow-orange-500/50',
    },
    {
      icon: BarChart3,
      title: t('landing.features.analytics.title'),
      description: t('landing.features.analytics.description'),
      gradient: 'from-indigo-500 to-violet-500',
      glow: 'shadow-indigo-500/50',
    },
    {
      icon: Shield,
      title: t('landing.features.security.title'),
      description: t('landing.features.security.description'),
      gradient: 'from-red-500 to-rose-500',
      glow: 'shadow-red-500/50',
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

  const parallaxOffset = scrollY * 0.08;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">
      {/* Animated Background Particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900" />
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-20 dark:opacity-10"
            style={{
              width: `${Math.random() * 100 + 50}px`,
              height: `${Math.random() * 100 + 50}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `radial-gradient(circle, ${
                ['#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'][Math.floor(Math.random() * 4)]
              } 0%, transparent 70%)`,
              animation: `float ${Math.random() * 20 + 10}s infinite ease-in-out`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Header with Glassmorphism */}
      <header 
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50 transition-all duration-300"
        style={{
          boxShadow: scrollY > 50 ? '0 4px 24px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="relative">
                <img
                  src="/image.png"
                  alt="ReceiptMaster Logo"
                  className="h-10 w-10 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-full" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                ReceiptMaster
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <LanguageSwitcher />
              {isAuthenticated ? (
                <>
                  <div className="text-sm text-gray-600 dark:text-gray-300 hidden md:block">
                    {t('landing.welcome')}, <span className="font-semibold">{user?.email?.split('@')[0]}!</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => window.location.href = '/dashboard'}
                    className="hover:scale-105 transition-transform duration-200"
                  >
                    {t('landing.goToDashboard')}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={logout}
                    className="hover:scale-105 transition-transform duration-200"
                  >
                    {t('auth.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={openLoginModal}
                    className="hover:scale-105 transition-transform duration-200"
                  >
                    {t('auth.login')}
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={openRegisterModal}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 hover:scale-105 transition-all duration-200 shadow-lg shadow-blue-500/50"
                  >
                    {t('auth.register')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Animated Gradient */}
      <section 
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20"
        style={{
          transform: `translateY(${parallaxOffset}px)`,
        }}
      >
        {/* Animated Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 dark:from-blue-800 dark:via-purple-800 dark:to-indigo-900">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-20 animate-[pulse_4s_ease-in-out_infinite]" />
        </div>

        {/* Floating Shapes */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white/10 backdrop-blur-sm"
              style={{
                width: `${Math.random() * 300 + 100}px`,
                height: `${Math.random() * 300 + 100}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `float-rotate ${Math.random() * 20 + 15}s infinite ease-in-out`,
                animationDelay: `${Math.random() * 5}s`,
              }}
            />
          ))}
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
          <div className="mb-8 inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 text-sm font-medium animate-fade-in">
            <Sparkles className="h-4 w-4" />
            <span>Modern Receipt Management</span>
          </div>
          
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-extrabold mb-6 text-white leading-tight animate-slide-up"
            style={{
              textShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <span className="block bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
              {isAuthenticated ? t('landing.hero.welcomeBack') : t('landing.hero.title')}
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl lg:text-3xl text-blue-100 mb-12 max-w-4xl mx-auto leading-relaxed animate-slide-up-delay">
            {isAuthenticated ? t('landing.hero.welcomeBackSubtitle') : t('landing.hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center animate-slide-up-delay-2">
            {isAuthenticated ? (
              <>
                <Button 
                  size="lg" 
                  className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-10 py-4 rounded-full font-semibold shadow-2xl hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300 flex items-center space-x-2 group" 
                  onClick={() => window.location.href = '/dashboard'}
                >
                  <span>{t('landing.hero.goToDashboard')}</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="border-2 border-white text-white hover:bg-white hover:text-blue-600 text-lg px-10 py-4 rounded-full font-semibold backdrop-blur-sm hover:scale-105 transition-all duration-300" 
                  onClick={logout}
                >
                  {t('auth.logout')}
                </Button>
              </>
            ) : (
              <>
                <Button 
                  size="lg" 
                  className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-10 py-4 rounded-full font-semibold shadow-2xl hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300 flex items-center space-x-2 group" 
                  onClick={openRegisterModal}
                >
                  <span>{t('landing.hero.getStarted')}</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="border-2 border-white text-white hover:bg-white hover:text-blue-600 text-lg px-10 py-4 rounded-full font-semibold backdrop-blur-sm hover:scale-105 transition-all duration-300" 
                  onClick={openLoginModal}
                >
                  {t('landing.hero.login')}
                </Button>
              </>
            )}
          </div>

          {/* Stats Preview */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto animate-fade-in-delay">
            {[
              { icon: Zap, value: '99.9%', label: 'Uptime' },
              { icon: TrendingUp, value: '10K+', label: 'Receipts' },
              { icon: Users, value: '1K+', label: 'Users' },
              { icon: Star, value: '4.9', label: 'Rating' },
            ].map((stat, i) => (
              <div 
                key={i}
                className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 text-white hover:bg-white/20 transition-all duration-300 hover:scale-105"
              >
                <stat.icon className="h-8 w-8 mb-2 mx-auto text-blue-200" />
                <div className="text-3xl font-bold mb-1">{stat.value}</div>
                <div className="text-sm text-blue-100">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 animate-bounce z-10">
          <div className="w-6 h-10 border-2 border-white/50 rounded-full flex justify-center">
            <div className="w-1 h-3 bg-white/50 rounded-full mt-2 animate-pulse" />
          </div>
        </div>
      </section>

      {/* Features Section with Glassmorphism Cards */}
      <section className="relative py-32 bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center space-x-2 text-blue-600 dark:text-blue-400 mb-4 font-semibold">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm uppercase tracking-wider">Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              {t('landing.features.title')}
            </h2>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl p-8 border border-gray-200/50 dark:border-gray-700/50 hover:border-transparent transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 overflow-hidden"
                style={{
                  animationDelay: `${index * 100}ms`,
                }}
              >
                {/* Gradient Background on Hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                
                {/* Icon */}
                <div className={`relative mb-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} ${feature.glow} shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                  <feature.icon className="h-8 w-8 text-white" />
                </div>
                
                {/* Content */}
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-purple-600 group-hover:bg-clip-text transition-all duration-300">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed relative z-10">
                  {feature.description}
                </p>

                {/* Decorative Element */}
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-blue-500/10 to-transparent rounded-tl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section with Split Layout */}
      <section className="relative py-32 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 text-green-600 dark:text-green-400 mb-4 font-semibold">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm uppercase tracking-wider">Benefits</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
                {t('landing.benefits.title')}
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-10 leading-relaxed">
                {t('landing.benefits.subtitle')}
              </p>
              <div className="space-y-5">
                {benefits.map((benefit, index) => (
                  <div 
                    key={index} 
                    className="flex items-center group p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300"
                    style={{
                      animationDelay: `${index * 100}ms`,
                    }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-green-500/50">
                      <CheckCircle className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-lg text-gray-700 dark:text-gray-300 font-medium">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-6">
              {[
                { icon: TrendingUp, gradient: 'from-blue-500 to-purple-600', title: t('landing.stats.revenue'), desc: t('landing.stats.revenueDesc') },
                { icon: FileText, gradient: 'from-green-500 to-teal-600', title: t('landing.stats.receipts'), desc: t('landing.stats.receiptsDesc') },
                { icon: Smartphone, gradient: 'from-orange-500 to-red-600', title: t('landing.stats.mobile'), desc: t('landing.stats.mobileDesc') },
                { icon: Globe, gradient: 'from-indigo-500 to-purple-600', title: t('landing.stats.global'), desc: t('landing.stats.globalDesc') },
              ].map((stat, i) => (
                <div 
                  key={i}
                  className={`relative bg-gradient-to-br ${stat.gradient} rounded-3xl p-8 text-white overflow-hidden group hover:scale-105 transition-all duration-500 shadow-xl`}
                  style={{
                    animationDelay: `${i * 100}ms`,
                  }}
                >
                  <div className="absolute inset-0 bg-white/10 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10">
                    <stat.icon className="h-10 w-10 mb-4 group-hover:rotate-12 transition-transform duration-300" />
                    <h3 className="text-xl font-bold mb-2">{stat.title}</h3>
                    <p className="text-sm opacity-90 leading-relaxed">{stat.desc}</p>
                  </div>
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 dark:from-blue-800 dark:via-purple-800 dark:to-indigo-900">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-20" />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <div className="mb-6 inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 text-sm font-medium">
            <Star className="h-4 w-4" />
            <span>Ready to get started?</span>
          </div>
          
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-white leading-tight">
            {isAuthenticated ? t('landing.cta.welcomeBackTitle') : t('landing.cta.title')}
          </h2>
          <p className="text-xl md:text-2xl text-blue-100 mb-12 max-w-2xl mx-auto leading-relaxed">
            {isAuthenticated ? t('landing.cta.welcomeBackSubtitle') : t('landing.cta.subtitle')}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            {isAuthenticated ? (
              <>
                <Button 
                  size="lg" 
                  className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-10 py-4 rounded-full font-semibold shadow-2xl hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300 flex items-center space-x-2 group" 
                  onClick={() => window.location.href = '/dashboard'}
                >
                  <span>{t('landing.cta.goToDashboard')}</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="border-2 border-white text-white hover:bg-white hover:text-blue-600 text-lg px-10 py-4 rounded-full font-semibold backdrop-blur-sm hover:scale-105 transition-all duration-300" 
                  onClick={logout}
                >
                  {t('auth.logout')}
                </Button>
              </>
            ) : (
              <>
                <Button 
                  size="lg" 
                  className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-10 py-4 rounded-full font-semibold shadow-2xl hover:shadow-blue-500/50 hover:scale-105 transition-all duration-300 flex items-center space-x-2 group" 
                  onClick={openRegisterModal}
                >
                  <span>{t('landing.cta.startFree')}</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="border-2 border-white text-white hover:bg-white hover:text-blue-600 text-lg px-10 py-4 rounded-full font-semibold backdrop-blur-sm hover:scale-105 transition-all duration-300" 
                  onClick={openLoginModal}
                >
                  {t('landing.cta.login')}
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <img
                  src="/image.png"
                  alt="ReceiptMaster Logo"
                  className="h-10 w-10 object-contain"
                />
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  ReceiptMaster
                </h3>
              </div>
              <p className="text-gray-400 mb-6 leading-relaxed max-w-md">
                {t('landing.footer.description')}
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-6">{t('landing.footer.product')}</h4>
              <ul className="space-y-3 text-gray-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors duration-200 hover:translate-x-1 inline-block">
                    {t('landing.footer.features')}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors duration-200 hover:translate-x-1 inline-block">
                    {t('landing.footer.pricing')}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors duration-200 hover:translate-x-1 inline-block">
                    {t('landing.footer.support')}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-6">{t('landing.footer.company')}</h4>
              <ul className="space-y-3 text-gray-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors duration-200 hover:translate-x-1 inline-block">
                    {t('landing.footer.about')}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors duration-200 hover:translate-x-1 inline-block">
                    {t('landing.footer.contact')}
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors duration-200 hover:translate-x-1 inline-block">
                    {t('landing.footer.privacy')}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
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

      {/* Add CSS Animations */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(-20px) translateX(10px);
          }
        }
        
        @keyframes float-rotate {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-30px) rotate(180deg);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 1s ease-out forwards;
        }

        .animate-slide-up {
          animation: slide-up 1s ease-out forwards;
        }

        .animate-slide-up-delay {
          animation: slide-up 1s ease-out 0.2s forwards;
          opacity: 0;
        }

        .animate-slide-up-delay-2 {
          animation: slide-up 1s ease-out 0.4s forwards;
          opacity: 0;
        }

        .animate-fade-in-delay {
          animation: fade-in 1s ease-out 0.6s forwards;
          opacity: 0;
        }

        /* Smooth scrolling */
        html {
          scroll-behavior: smooth;
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 10px;
        }

        ::-webkit-scrollbar-track {
          background: rgb(249, 250, 251);
        }

        .dark ::-webkit-scrollbar-track {
          background: rgb(17, 24, 39);
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #3b82f6, #8b5cf6);
          border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #2563eb, #7c3aed);
        }
      `}</style>
    </div>
  );
};