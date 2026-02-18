import React from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';

interface HeroSectionProps {
  onOpenRegister: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenRegister }) => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — Copy */}
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-medium mb-6 landing-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {t('landing.hero.badge')}
            </div>

            {isAuthenticated ? (
              <>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-[1.1] tracking-tight mb-6 landing-fade-in landing-delay-1">
                  {t('landing.hero.welcomeBack')}
                </h1>
                <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 leading-relaxed mb-8 landing-fade-in landing-delay-2">
                  {t('landing.hero.welcomeBackSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 landing-fade-in landing-delay-3">
                  <Button
                    size="lg"
                    className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-lg font-medium shadow-sm inline-flex items-center gap-2 group"
                    onClick={() => window.location.href = '/dashboard'}
                  >
                    {t('landing.hero.goToDashboard')}
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-[1.1] tracking-tight mb-6 landing-fade-in landing-delay-1">
                  {t('landing.hero.title')}
                  <span className="text-blue-600 dark:text-blue-400">
                    {' '}{t('landing.hero.titleHighlight')}
                  </span>
                </h1>
                <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 leading-relaxed mb-8 landing-fade-in landing-delay-2">
                  {t('landing.hero.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 landing-fade-in landing-delay-3">
                  <Button
                    size="lg"
                    className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-lg font-medium shadow-sm inline-flex items-center gap-2 group"
                    onClick={onOpenRegister}
                  >
                    {t('landing.hero.startFree')}
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2"
                    onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    <Play className="h-4 w-4" />
                    {t('landing.hero.viewDemo')}
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Right — Dashboard Mockup */}
          <div className="relative landing-fade-in landing-delay-2 hidden lg:block">
            <div className="relative">
              {/* Subtle glow behind card */}
              <div className="absolute -inset-4 bg-blue-500/5 dark:bg-blue-400/5 rounded-3xl blur-2xl" />

              {/* Dashboard preview card */}
              <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="px-4 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs text-gray-500 dark:text-gray-400 font-mono">
                      app.receiptmaster.io/dashboard
                    </div>
                  </div>
                </div>

                {/* Dashboard content mockup */}
                <div className="p-6 space-y-4">
                  {/* Stat cards row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Revenue', value: '24,580', color: 'text-green-600 dark:text-green-400' },
                      { label: 'Orders', value: '142', color: 'text-blue-600 dark:text-blue-400' },
                      { label: 'Receipts', value: '98', color: 'text-purple-600 dark:text-purple-400' },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</div>
                        <div className={`text-lg font-semibold ${stat.color}`}>{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Chart placeholder */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Revenue — Last 7 days</div>
                    <div className="flex items-end gap-1.5 h-20">
                      {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-blue-500/20 dark:bg-blue-400/20 rounded-t"
                          style={{ height: `${h}%` }}
                        >
                          <div
                            className="w-full bg-blue-500 dark:bg-blue-400 rounded-t transition-all duration-500"
                            style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Table preview */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      Recent Orders
                    </div>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div className="w-16 h-2.5 bg-gray-200 dark:bg-gray-700 rounded" />
                        <div className="flex-1 h-2.5 bg-gray-200 dark:bg-gray-700 rounded" />
                        <div className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          i === 1 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          i === 2 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {i === 1 ? 'Confirmed' : i === 2 ? 'Draft' : 'Pending'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
