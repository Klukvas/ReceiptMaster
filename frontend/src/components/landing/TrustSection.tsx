import React from "react";
import { useTranslation } from "../../hooks/useTranslation";

// Only facts the code backs: the template registry size, the three
// interface languages, and the Telegram bot.
const STAT_KEYS: ReadonlyArray<{
  id: string;
  valueKey: string;
  labelKey: string;
}> = [
  {
    id: "templates",
    valueKey: "landing.stats.templatesValue",
    labelKey: "landing.stats.templates",
  },
  {
    id: "languages",
    valueKey: "landing.stats.languagesValue",
    labelKey: "landing.stats.languages",
  },
  {
    id: "bot",
    valueKey: "landing.stats.botValue",
    labelKey: "landing.stats.bot",
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
            <span className="landing-trusted-n">{t(stat.valueKey)}</span>
            <span className="landing-trusted-l">{t(stat.labelKey)}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

TrustSection.displayName = "TrustSection";
