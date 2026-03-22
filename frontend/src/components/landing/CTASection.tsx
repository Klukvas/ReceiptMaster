import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';

interface CTASectionProps {
  onOpenRegister: () => void;
}

export const CTASection: React.FC<CTASectionProps> = React.memo(({ onOpenRegister }) => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <section className="landing-cta-section" id="pricing">
      <div className="landing-cta-inner">
        <h2>
          {isAuthenticated
            ? t('landing.cta.welcomeBackTitle')
            : t('landing.cta.title')}
        </h2>
        <p>
          {isAuthenticated
            ? t('landing.cta.welcomeBackSubtitle')
            : t('landing.cta.subtitle')}
        </p>
        {isAuthenticated ? (
          <a href="/dashboard" className="landing-btn-white">
            {t('landing.cta.goToDashboard')}
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : (
          <button className="landing-btn-white" onClick={onOpenRegister}>
            {t('landing.cta.startFree')}
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
});

CTASection.displayName = 'CTASection';
