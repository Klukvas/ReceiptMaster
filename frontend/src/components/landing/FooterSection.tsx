import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "../../hooks/useTranslation";

const FluxLabBadge = () => (
  <a
    href="https://flux-lab.dev/en"
    className="powered-by-badge"
    target="_blank"
    rel="noopener noreferrer"
  >
    <div className="powered-by-badge__icon">
      <svg width="12" height="10" viewBox="0 0 62 52" fill="none" aria-hidden="true">
        <g className="fl1">
          <polygon points="31,3 57,15 31,27 5,15" fill="white" opacity=".92" />
        </g>
        <g className="fl2">
          <line x1="5" y1="25" x2="31" y2="36" stroke="#9E94F9" strokeWidth="3" strokeLinecap="round" opacity=".68" />
          <line x1="31" y1="36" x2="57" y2="25" stroke="#9E94F9" strokeWidth="3" strokeLinecap="round" opacity=".68" />
        </g>
        <g className="fl3">
          <line x1="5" y1="35" x2="31" y2="47" stroke="#7B6EF6" strokeWidth="4" strokeLinecap="round" />
          <line x1="31" y1="47" x2="57" y2="35" stroke="#7B6EF6" strokeWidth="4" strokeLinecap="round" />
        </g>
      </svg>
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span className="powered-by-badge__label">powered by</span>
      <span className="powered-by-badge__brand">flux-lab</span>
      <span className="powered-by-badge__tld">.dev</span>
    </div>
  </a>
);

export const FooterSection: React.FC = React.memo(() => {
  const { t } = useTranslation();

  return (
    <footer className="landing-footer">
      <a href="/" className="landing-logo">
        <img src="/logo-icon.svg" alt="receiptmaster" className="landing-logo-icon" />
        <span className="landing-logo-name">
          receipt<em>master</em>
        </span>
      </a>
      <div className="landing-footer-links">
        <a href="#features">{t("landing.footer.features")}</a>
        <a href="#pricing">{t("landing.footer.pricing")}</a>
        <Link to="/blog">{t("landing.nav.blog")}</Link>
        <a href="/api/docs">{t("landing.footer.apiDocs")}</a>
        <Link to="/privacy">{t("landing.footer.privacy")}</Link>
        <Link to="/terms">{t("landing.footer.terms")}</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="landing-footer-copy">
          &copy; {new Date().getFullYear()} receiptmaster.org
        </span>
        <FluxLabBadge />
      </div>
    </footer>
  );
});

FooterSection.displayName = "FooterSection";
