import React, { useId } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { useAuth } from "../../hooks/useAuth";
import { getScrollBehavior } from "../../lib/scroll-behavior";

interface HeroSectionProps {
  onOpenRegister: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = React.memo(
  ({ onOpenRegister }) => {
    const { t } = useTranslation();
    const { isAuthenticated } = useAuth();
    const gradientId = useId();

    return (
      <section className="landing-hero">
        <div className="landing-hero-left">
          {isAuthenticated ? (
            <>
              <h1 className="l-au l-d1">{t("landing.hero.welcomeBack")}</h1>
              <p className="landing-hero-sub l-au l-d2">
                {t("landing.hero.welcomeBackSubtitle")}
              </p>
              <div className="landing-hero-btns l-au l-d3">
                <a href="/dashboard" className="landing-btn-primary">
                  {t("landing.hero.goToDashboard")}
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    viewBox="0 0 14 14"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
            </>
          ) : (
            <>
              <h1 className="l-au l-d1">
                {t("landing.hero.line1")}
                <br />
                {"& "}
                <span className="ul">{t("landing.hero.line2")}</span>
                <br />
                <span className="accent">{t("landing.hero.line3")}</span>
              </h1>
              <p className="landing-hero-sub l-au l-d2">
                {t("landing.hero.subtitle")}
              </p>
              <div className="landing-hero-btns l-au l-d3">
                <button
                  className="landing-btn-primary"
                  onClick={onOpenRegister}
                >
                  {t("landing.hero.startFree")}
                </button>
                <button
                  className="landing-btn-secondary"
                  onClick={() =>
                    document
                      .getElementById("features")
                      ?.scrollIntoView({ behavior: getScrollBehavior() })
                  }
                >
                  {t("landing.hero.seeDemo")}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Floating UI cards */}
        <div className="landing-hero-right l-au l-d4">
          {/* Receipt card */}
          <div className="landing-fc landing-fc-receipt">
            <div className="landing-frc-head">
              <span className="landing-frc-brand">receiptmaster</span>
              <span className="landing-frc-status">
                {t("landing.mock.generated")}
              </span>
            </div>
            <div className="landing-frc-num">
              {t("landing.mock.receiptNumber", { number: "2024-000847" })}
            </div>
            <div
              className="landing-frc-row"
              style={{ borderBottom: "none", paddingBottom: 0 }}
            >
              <span className="landing-frc-item">
                {t("landing.mock.billedTo")}
              </span>
              <span
                className="landing-frc-price"
                style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600 }}
              >
                Olena Marchenko
              </span>
            </div>
            <div className="landing-frc-row">
              <span className="landing-frc-item">Laptop Stand Pro</span>
              <span className="landing-frc-price">{"\u20B4"} 1 200</span>
            </div>
            <div className="landing-frc-row">
              <span className="landing-frc-item">USB-C Hub {"\u00D7"} 2</span>
              <span className="landing-frc-price">{"\u20B4"} 860</span>
            </div>
            <div className="landing-frc-row">
              <span className="landing-frc-item">Mechanical Keyboard</span>
              <span className="landing-frc-price">{"\u20B4"} 2 400</span>
            </div>
            <div className="landing-frc-total">
              <span className="landing-frc-total-l">
                {t("landing.mock.total")}
              </span>
              <span className="landing-frc-total-v">{"\u20B4"} 4 460</span>
            </div>
          </div>

          {/* Revenue card */}
          <div className="landing-fc landing-fc-revenue">
            <div className="landing-frv-label">
              {t("landing.mock.revenue30Days")}
            </div>
            <div className="landing-frv-value">{"\u20B4"} 86,240</div>
            <div className="landing-frv-change">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 9V3M3 6l3-3 3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              +18.4%
            </div>
            <div className="landing-frv-chart">
              <svg
                viewBox="0 0 200 46"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,40 L20,34 L40,36 L60,26 L80,28 L100,18 L120,20 L140,11 L160,7 L180,4 L200,2 L200,46 L0,46Z"
                  fill={`url(#${gradientId})`}
                />
                <path
                  d="M0,40 L20,34 L40,36 L60,26 L80,28 L100,18 L120,20 L140,11 L160,7 L180,4 L200,2"
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Orders card */}
          <div className="landing-fc landing-fc-orders">
            <div className="landing-fo-title">
              {t("landing.mock.recentOrders")}
            </div>
            <div className="landing-fo-row">
              <div>
                <div className="landing-fo-name">Dmytro Koval</div>
                <div className="landing-fo-date">
                  {t("landing.mock.today", { time: "14:32" })}
                </div>
              </div>
              <span className="landing-tag landing-tag-indigo">
                {t("landing.mock.confirmed")}
              </span>
            </div>
            <div className="landing-fo-row">
              <div>
                <div className="landing-fo-name">Sofia Bondar</div>
                <div className="landing-fo-date">
                  {t("landing.mock.today", { time: "11:08" })}
                </div>
              </div>
              <span className="landing-tag landing-tag-green">
                {t("landing.mock.paid")}
              </span>
            </div>
            <div className="landing-fo-row">
              <div>
                <div className="landing-fo-name">Ivan Petrenko</div>
                <div className="landing-fo-date">
                  {t("landing.mock.yesterday")}
                </div>
              </div>
              <span className="landing-tag landing-tag-amber">
                {t("landing.mock.draft")}
              </span>
            </div>
          </div>

          {/* Products card */}
          <div className="landing-fc landing-fc-products">
            <div className="landing-fo-title">
              {t("landing.mock.topProducts")}
            </div>
            {[
              { name: "Laptop Stand Pro", qty: 48, badge: "in-stock" },
              { name: "USB-C Hub", qty: 3, badge: "low" },
              { name: "Mech Keyboard", qty: 0, badge: "out" },
            ].map((p) => (
              <div className="landing-fo-row" key={p.name}>
                <div>
                  <div className="landing-fo-name">{p.name}</div>
                  <div className="landing-fo-date">
                    {t("landing.mock.pieces", { count: p.qty })}
                  </div>
                </div>
                <span
                  className={`landing-tag ${
                    p.badge === "in-stock"
                      ? "landing-tag-green"
                      : p.badge === "low"
                        ? "landing-tag-amber"
                        : "landing-tag-red"
                  }`}
                >
                  {p.badge === "in-stock"
                    ? t("landing.mock.inStock")
                    : p.badge === "low"
                      ? t("landing.mock.lowStock")
                      : t("landing.mock.outOfStock")}
                </span>
              </div>
            ))}
          </div>

          {/* Analytics donut card */}
          <div className="landing-fc landing-fc-analytics">
            <div className="landing-fo-title">
              {t("landing.mock.orderStatus")}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 4,
              }}
            >
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  fill="none"
                  stroke="var(--l-border)"
                  strokeWidth="8"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  fill="none"
                  stroke="var(--l-indigo)"
                  strokeWidth="8"
                  strokeDasharray="96 55"
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                  }}
                />
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  fill="none"
                  stroke="var(--l-green)"
                  strokeWidth="8"
                  strokeDasharray="38 113"
                  strokeDashoffset="-96"
                  strokeLinecap="round"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                  }}
                />
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  fill="none"
                  stroke="var(--l-amber)"
                  strokeWidth="8"
                  strokeDasharray="17 134"
                  strokeDashoffset="-134"
                  strokeLinecap="round"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                  }}
                />
              </svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {[
                  {
                    label: t("landing.mock.confirmed"),
                    color: "var(--l-indigo)",
                    pct: "64%",
                  },
                  {
                    label: t("landing.mock.paid"),
                    color: "var(--l-green)",
                    pct: "25%",
                  },
                  {
                    label: t("landing.mock.draft"),
                    color: "var(--l-amber)",
                    pct: "11%",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: s.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 11, color: "var(--l-muted)" }}>
                      {s.label}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--l-text)",
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {s.pct}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  },
);

HeroSection.displayName = "HeroSection";
