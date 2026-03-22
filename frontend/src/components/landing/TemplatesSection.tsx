import React, { useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

const TEMPLATES = [
  {
    id: "modern",
    accent: "#4F46E5",
    accentLight: "rgba(79,70,229,0.08)",
    bg: "#FFFFFF",
    style: "card" as const,
  },
  {
    id: "elegant",
    accent: "#111827",
    accentLight: "rgba(17,24,39,0.05)",
    bg: "#FFFFFF",
    style: "line" as const,
  },
  {
    id: "dark",
    accent: "#4FC3F7",
    accentLight: "rgba(79,195,247,0.12)",
    bg: "#1a1a2e",
    style: "dark" as const,
  },
  {
    id: "vintage",
    accent: "#6B4F35",
    accentLight: "rgba(107,79,53,0.08)",
    bg: "#FDF8F0",
    style: "serif" as const,
  },
  {
    id: "corporate",
    accent: "#000000",
    accentLight: "rgba(0,0,0,0.04)",
    bg: "#FFFFFF",
    style: "mono" as const,
  },
  {
    id: "branded",
    accent: "#2563EB",
    accentLight: "rgba(37,99,235,0.08)",
    bg: "#FFFFFF",
    style: "card" as const,
  },
  {
    id: "minimal",
    accent: "#6B7280",
    accentLight: "rgba(107,114,128,0.05)",
    bg: "#FFFFFF",
    style: "line" as const,
  },
] as const;

const ReceiptMockup: React.FC<{
  accent: string;
  accentLight: string;
  bg: string;
  style: string;
  name: string;
  category: string;
}> = ({ accent, accentLight, bg, style, name, category }) => {
  const isDark = style === "dark";
  const textColor = isDark ? "#E0E0E0" : "#333";
  const mutedColor = isDark ? "#777" : "#999";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const fontFamily =
    style === "serif"
      ? "Georgia, serif"
      : style === "mono"
        ? "'DM Mono', monospace"
        : "'Manrope', sans-serif";

  return (
    <div className="landing-tpl-card">
      <div
        className="landing-tpl-preview"
        style={{ background: bg, fontFamily }}
      >
        {/* Accent bar */}
        <div
          style={{ height: 3, background: accent, borderRadius: "2px 2px 0 0" }}
        />

        <div style={{ padding: "14px 16px 12px" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: accent,
                  opacity: 0.15,
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: accent,
                  letterSpacing: "-0.02em",
                }}
              >
                receiptmaster
              </span>
            </div>
            <span
              style={{
                fontSize: 7,
                color: mutedColor,
                fontFamily: "'DM Mono', monospace",
              }}
            >
              #2024-0847
            </span>
          </div>

          {/* Info cards */}
          {style === "card" && (
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {["Bill to", "Date"].map((label) => (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    background: accentLight,
                    borderRadius: 4,
                    padding: "5px 6px",
                  }}
                >
                  <div
                    style={{ fontSize: 6, color: mutedColor, marginBottom: 2 }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      height: 5,
                      background: borderColor,
                      borderRadius: 2,
                      width: "70%",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {style !== "card" && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: `1px ${style === "serif" ? "double" : "solid"} ${borderColor}`,
              }}
            >
              <div>
                <div style={{ fontSize: 6, color: mutedColor }}>Bill to</div>
                <div
                  style={{
                    height: 5,
                    background: borderColor,
                    borderRadius: 2,
                    width: 50,
                    marginTop: 2,
                  }}
                />
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 6, color: mutedColor }}>Date</div>
                <div
                  style={{
                    height: 5,
                    background: borderColor,
                    borderRadius: 2,
                    width: 40,
                    marginTop: 2,
                  }}
                />
              </div>
            </div>
          )}

          {/* Table header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
              paddingBottom: 3,
              borderBottom: `1px solid ${borderColor}`,
            }}
          >
            <span
              style={{
                fontSize: 6,
                fontWeight: 600,
                color: mutedColor,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Item
            </span>
            <span
              style={{
                fontSize: 6,
                fontWeight: 600,
                color: mutedColor,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Amount
            </span>
          </div>

          {/* Table rows */}
          {[65, 50, 40].map((w, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 0",
                borderBottom: i < 2 ? `1px solid ${borderColor}` : "none",
              }}
            >
              <div
                style={{
                  height: 4,
                  background: borderColor,
                  borderRadius: 2,
                  width: `${w}%`,
                }}
              />
              <div
                style={{
                  height: 4,
                  background: borderColor,
                  borderRadius: 2,
                  width: 24,
                }}
              />
            </div>
          ))}

          {/* Total */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
              paddingTop: 6,
              borderTop: `1.5px solid ${isDark ? accent : textColor}`,
            }}
          >
            <span style={{ fontSize: 8, fontWeight: 600, color: textColor }}>
              Total
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: accent,
                letterSpacing: "-0.03em",
              }}
            >
              {"\u20B4"} 4,460
            </span>
          </div>

          {/* Footer hash */}
          <div
            style={{
              marginTop: 6,
              fontSize: 5.5,
              color: mutedColor,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            SHA256: a3f8e2...
          </div>
        </div>
      </div>
      <div className="landing-tpl-name">{name}</div>
      <div className="landing-tpl-category">{category}</div>
    </div>
  );
};

export const TemplatesSection: React.FC = React.memo(() => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 280;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }, []);

  return (
    <section className="landing-section" id="templates">
      <div className="landing-section-tag">{t("landing.templates.label")}</div>
      <h2>{t("landing.templates.title")}</h2>
      <p className="landing-section-sub">{t("landing.templates.subtitle")}</p>

      <div className="landing-tpl-wrapper">
        <button
          className="landing-tpl-arrow landing-tpl-arrow-left"
          onClick={() => scroll("left")}
          aria-label="Previous templates"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="landing-tpl-track" ref={scrollRef}>
          {TEMPLATES.map(({ id, accent, accentLight, bg, style }) => (
            <ReceiptMockup
              key={id}
              accent={accent}
              accentLight={accentLight}
              bg={bg}
              style={style}
              name={t(`landing.templates.${id}.name`)}
              category={t(`landing.templates.${id}.category`)}
            />
          ))}
        </div>

        <button
          className="landing-tpl-arrow landing-tpl-arrow-right"
          onClick={() => scroll("right")}
          aria-label="Next templates"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
});

TemplatesSection.displayName = "TemplatesSection";
