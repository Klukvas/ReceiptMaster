import React from 'react';
import { Shield, Clock, Lock, Database } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

export const TrustSection: React.FC = () => {
  const { t } = useTranslation();

  const badges = [
    { icon: Shield, label: t('landing.trust.gdpr') },
    { icon: Clock, label: t('landing.trust.uptime') },
    { icon: Lock, label: t('landing.trust.encrypted') },
    { icon: Database, label: t('landing.trust.multiTenant') },
  ];

  return (
    <section className="py-12 border-y border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 lg:gap-12">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
            {t('landing.trust.badge')}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 lg:gap-8">
            {badges.map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-2 text-gray-500 dark:text-gray-400"
              >
                <badge.icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
