import React from "react";
import { useTranslation } from "../../hooks/useTranslation";

const STAT_KEYS: ReadonlyArray<{
  id: string;
  valueKey: string;
  labelKey: string;
  highlight?: boolean;
}> = [
  {
    id: "receipts",
    valueKey: "landing.stats.receiptsValue",
    labelKey: "landing.stats.receipts",
  },
  {
    id: "orders",
    valueKey: "landing.stats.ordersValue",
    labelKey: "landing.stats.orders",
  },
  {
    id: "merchants",
    valueKey: "landing.stats.merchantsValue",
    labelKey: "landing.stats.merchants",
  },
  {
    id: "languages",
    valueKey: "landing.stats.languagesValue",
    labelKey: "landing.stats.languages",
  },
  {
    id: "uptime",
    valueKey: "landing.stats.uptimeValue",
    labelKey: "landing.stats.uptime",
    highlight: true,
  },
];

export const TrustSection: React.FC = React.memo(() => {
  const { t } = useTranslation();

  return (
    <div className="landing-trusted">
      <span className="landing-trusted-label">{t("landing.stats.label")}</span>
      <div className="landing-trusted-sep" />
      <div className="landing-trusted-items">
        {STAT_KEYS.map((stat) => (
          <div key={stat.id}>
            <span
              className="landing-trusted-n"
              style={stat.highlight ? { color: "var(--l-green)" } : undefined}
            >
              {t(stat.valueKey)}
            </span>
            <span className="landing-trusted-l">{t(stat.labelKey)}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

TrustSection.displayName = "TrustSection";
