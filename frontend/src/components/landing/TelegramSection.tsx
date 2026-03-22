import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const FEAT_ICONS = [
  <svg key="cart" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="16" r="1.5" />
    <circle cx="16" cy="16" r="1.5" />
    <path d="M1 1h3l2.5 12h10l2-7H6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  <svg key="user" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="7" r="3" />
    <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" strokeLinecap="round" />
  </svg>,
  <svg key="bolt" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M13 2L3 14h7l-1 6 10-12h-7l1-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
] as const;

export const TelegramSection: React.FC = React.memo(() => {
  const { t } = useTranslation();

  return (
    <section className="landing-tg-section" id="telegram">
      <div className="landing-tg-inner">
        {/* Bot UI mockup */}
        <div>
          <div className="landing-tg-ui">
            <div className="landing-tg-header">
              <div className="landing-tg-avatar">RM</div>
              <div>
                <div className="landing-tg-botname">ReceiptMaster Bot</div>
                <div className="landing-tg-online">{'\u25CF'} online</div>
              </div>
            </div>
            <div className="landing-tg-body">
              <div className="landing-tg-msg">
                <div className="landing-tg-bubble landing-tg-bubble-in">
                  Welcome! Browse our catalog with /products or check your cart
                  with /cart.
                </div>
              </div>
              <div className="landing-tg-msg landing-tg-msg-out">
                <div className="landing-tg-bubble landing-tg-bubble-out">
                  /products
                </div>
              </div>
              <div className="landing-tg-clear" />
              <div className="landing-tg-msg">
                <div className="landing-tg-bubble landing-tg-bubble-in">
                  <strong>Catalog:</strong>
                  <br />
                  <br />
                  Laptop Stand Pro — {'\u20B4'}1,200
                  <br />
                  USB-C Hub — {'\u20B4'}430
                  <br />
                  Mechanical Keyboard — {'\u20B4'}2,400
                </div>
              </div>
              <div className="landing-tg-btngrid">
                <div className="landing-tg-btn">+ Laptop Stand</div>
                <div className="landing-tg-btn">+ USB-C Hub</div>
                <div className="landing-tg-btn">+ Keyboard</div>
                <div className="landing-tg-btn">View Cart</div>
              </div>
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="landing-tg-text">
          <div className="landing-section-tag">
            {t('landing.telegram.label')}
          </div>
          <h2>{t('landing.telegram.title')}</h2>
          <p>{t('landing.telegram.description')}</p>
          <div className="landing-tg-features">
            {[1, 2, 3].map((n) => (
              <div key={n} className="landing-tg-feat">
                <div className="landing-tg-feat-icon">{FEAT_ICONS[n - 1]}</div>
                <div>
                  <div className="landing-tg-feat-title">
                    {t(`landing.telegram.feat${n}.title`)}
                  </div>
                  <div className="landing-tg-feat-desc">
                    {t(`landing.telegram.feat${n}.description`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

TelegramSection.displayName = 'TelegramSection';
