import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';

interface CTASectionProps {
  onOpenRegister: () => void;
}

export const CTASection: React.FC<CTASectionProps> = ({ onOpenRegister }) => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <section className="py-20 lg:py-28 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative bg-gray-900 dark:bg-gray-800 rounded-2xl px-8 py-14 sm:px-14 sm:py-16 overflow-hidden">
          {/* Subtle accent */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">
              {isAuthenticated ? t('landing.cta.welcomeBackTitle') : t('landing.cta.title')}
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed mb-8">
              {isAuthenticated ? t('landing.cta.welcomeBackSubtitle') : t('landing.cta.subtitle')}
            </p>

            {isAuthenticated ? (
              <Button
                size="lg"
                className="bg-white text-gray-900 hover:bg-gray-100 px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 group"
                onClick={() => window.location.href = '/dashboard'}
              >
                {t('landing.cta.goToDashboard')}
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            ) : (
              <Button
                size="lg"
                className="bg-white text-gray-900 hover:bg-gray-100 px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 group"
                onClick={onOpenRegister}
              >
                {t('landing.cta.startFree')}
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
