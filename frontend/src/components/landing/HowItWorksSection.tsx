import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const STEPS = ['01', '02', '03'] as const;

export const HowItWorksSection: React.FC = React.memo(() => {
  const { t } = useTranslation();

  return (
    <section className="landing-steps-section" id="how-it-works">
      <div className="landing-section-tag">
        {t('landing.howItWorks.label')}
      </div>
      <h2>{t('landing.howItWorks.title')}</h2>
      <p className="landing-section-sub">
        {t('landing.howItWorks.subtitle')}
      </p>
      <div className="landing-steps">
        {STEPS.map((num, i) => (
          <div key={num} className="landing-step">
            <div className="landing-step-num">{num}</div>
            <div className="landing-step-title">
              {t(`landing.howItWorks.step${i + 1}.title`)}
            </div>
            <div className="landing-step-desc">
              {t(`landing.howItWorks.step${i + 1}.description`)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});

HowItWorksSection.displayName = 'HowItWorksSection';
