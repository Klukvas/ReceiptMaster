import { type ReactNode } from "react";

interface KPIPrimaryCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  accentColor: "green" | "indigo" | "purple";
}

const accents = {
  green: {
    gradient: "from-[var(--color-success)]/10 via-transparent to-transparent",
    ring: "ring-[var(--color-success)]/10",
    iconBg: "bg-[var(--color-success-light)]",
    iconText: "text-success-base",
    glow: "shadow-[var(--color-success)]/5",
  },
  indigo: {
    gradient: "from-accent-base/10 via-transparent to-transparent",
    ring: "ring-[var(--color-ring)]",
    iconBg: "bg-[var(--color-accent-light)]",
    iconText: "text-accent-base",
    glow: "shadow-indigo-500/5",
  },
  purple: {
    gradient:
      "from-violet-500/10 via-transparent to-transparent dark:from-violet-500/5",
    ring: "ring-violet-500/20 dark:ring-violet-400/10",
    iconBg: "bg-violet-100 dark:bg-violet-900/30",
    iconText: "text-violet-600 dark:text-violet-400",
    glow: "shadow-violet-500/5",
  },
};

export const KPIPrimaryCard = ({
  label,
  value,
  icon,
  accentColor,
}: KPIPrimaryCardProps) => {
  const a = accents[accentColor];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-elevated border border-[var(--color-border)] p-6 ring-1 ${a.ring} shadow-lg ${a.glow} transition-all duration-200`}
    >
      {/* Gradient glow */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${a.gradient} pointer-events-none`}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-content-tertiary uppercase tracking-wide">
            {label}
          </p>
          <div className={`p-2.5 rounded-xl ${a.iconBg}`}>
            <span className={a.iconText}>{icon}</span>
          </div>
        </div>
        <p className="text-3xl sm:text-4xl font-bold tracking-tight text-content tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
};
