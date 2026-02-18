import React from 'react';
import { Database, Cpu, Fingerprint } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

export const DifferentiatorsSection: React.FC = () => {
  const { t } = useTranslation();

  const items = [
    {
      icon: Database,
      title: t('landing.differentiators.rls.title'),
      description: t('landing.differentiators.rls.description'),
    },
    {
      icon: Cpu,
      title: t('landing.differentiators.pdf.title'),
      description: t('landing.differentiators.pdf.description'),
    },
    {
      icon: Fingerprint,
      title: t('landing.differentiators.hash.title'),
      description: t('landing.differentiators.hash.description'),
    },
  ];

  return (
    <section className="py-20 lg:py-28 bg-gray-50 dark:bg-gray-800/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="max-w-2xl mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium mb-4">
            {t('landing.differentiators.label')}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white leading-tight mb-4">
            {t('landing.differentiators.title')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
            {t('landing.differentiators.subtitle')}
          </p>
        </div>

        {/* Differentiator cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((item) => (
            <div
              key={item.title}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-5">
                <item.icon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {item.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
