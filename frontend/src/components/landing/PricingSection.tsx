import React from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface PricingSectionProps {
  onOpenRegister: () => void;
}

const PLANS = ['free', 'pro', 'business'] as const;

export const PricingSection: React.FC<PricingSectionProps> = React.memo(({ onOpenRegister }) => {
  const { t } = useTranslation();

  return (
    <section className="landing-section" id="pricing">
      <div className="landing-section-tag">{t('landing.pricing.label')}</div>
      <h2>{t('landing.pricing.title')}</h2>
      <p className="landing-section-sub">{t('landing.pricing.subtitle')}</p>

      <div className="landing-pricing-grid">
        {PLANS.map((plan) => {
          const isPro = plan === 'pro';
          const isBusiness = plan === 'business';

          return (
            <div
              key={plan}
              className={`landing-pricing-card ${isPro ? 'landing-pricing-featured' : ''}`}
            >
              {isPro && (
                <div className="landing-pricing-badge">
                  {t('landing.pricing.popular')}
                </div>
              )}

              <div className="landing-pricing-header">
                <h3 className="landing-pricing-name">
                  {t(`landing.pricing.${plan}.name`)}
                </h3>
                <div className="landing-pricing-price">
                  <span className="landing-pricing-amount">
                    {t(`landing.pricing.${plan}.price`)}
                  </span>
                  {plan !== 'free' && (
                    <span className="landing-pricing-period">
                      / {t('landing.pricing.month')}
                    </span>
                  )}
                </div>
                <p className="landing-pricing-desc">
                  {t(`landing.pricing.${plan}.description`)}
                </p>
              </div>

              <ul className="landing-pricing-features">
                {[1, 2, 3, 4].map((n) => {
                  const key = `landing.pricing.${plan}.feat${n}`;
                  const val = t(key);
                  if (val === key) return null;
                  return (
                    <li key={n}>
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        style={{
                          color: isBusiness ? '#8B5CF6' : isPro ? 'var(--l-indigo)' : 'var(--l-green)',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      <span>{val}</span>
                    </li>
                  );
                })}
              </ul>

              <button
                className={isPro ? 'landing-btn-primary landing-pricing-cta' : 'landing-btn-secondary landing-pricing-cta'}
                onClick={onOpenRegister}
              >
                {t(`landing.pricing.${plan}.cta`)}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
});

PricingSection.displayName = 'PricingSection';
