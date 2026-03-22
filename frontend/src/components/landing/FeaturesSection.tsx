import React from 'react';
import {
  LayoutGrid,
  User,
  List,
  FileText,
  TrendingUp,
  MessageCircle,
} from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

const FEATURE_KEYS = [
  { id: 'products', icon: LayoutGrid },
  { id: 'customers', icon: User },
  { id: 'orders', icon: List },
  { id: 'receipts', icon: FileText },
  { id: 'analytics', icon: TrendingUp },
  { id: 'telegramBot', icon: MessageCircle },
] as const;

export const FeaturesSection: React.FC = React.memo(() => {
  const { t } = useTranslation();

  return (
    <section className="landing-section" id="features">
      <div className="landing-section-tag">{t('landing.grid.label')}</div>
      <h2>{t('landing.grid.title')}</h2>
      <p className="landing-section-sub">{t('landing.grid.subtitle')}</p>
      <div className="landing-feat-grid">
        {FEATURE_KEYS.map(({ id, icon: Icon }) => (
          <div key={id} className="landing-feat-card">
            <div className="landing-feat-icon">
              <Icon size={20} strokeWidth={1.5} />
            </div>
            <div className="landing-feat-title">
              {t(`landing.grid.${id}.title`)}
            </div>
            <div className="landing-feat-desc">
              {t(`landing.grid.${id}.description`)}
            </div>
            <div className="landing-feat-pills">
              {[1, 2, 3].map((n) => (
                <span key={n} className="landing-feat-pill">
                  {t(`landing.grid.${id}.tag${n}`)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});

FeaturesSection.displayName = 'FeaturesSection';
