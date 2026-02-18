import { type ReactNode } from 'react';

interface KPIPrimaryCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  accentColor: 'green' | 'blue' | 'purple';
}

const accents = {
  green: {
    gradient: 'from-emerald-500/10 via-transparent to-transparent dark:from-emerald-500/5',
    ring: 'ring-emerald-500/20 dark:ring-emerald-400/10',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    glow: 'shadow-emerald-500/5',
  },
  blue: {
    gradient: 'from-blue-500/10 via-transparent to-transparent dark:from-blue-500/5',
    ring: 'ring-blue-500/20 dark:ring-blue-400/10',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconText: 'text-blue-600 dark:text-blue-400',
    glow: 'shadow-blue-500/5',
  },
  purple: {
    gradient: 'from-violet-500/10 via-transparent to-transparent dark:from-violet-500/5',
    ring: 'ring-violet-500/20 dark:ring-violet-400/10',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconText: 'text-violet-600 dark:text-violet-400',
    glow: 'shadow-violet-500/5',
  },
};

export const KPIPrimaryCard = ({ label, value, icon, accentColor }: KPIPrimaryCardProps) => {
  const a = accents[accentColor];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 p-6 ring-1 ${a.ring} shadow-lg ${a.glow} transition-all duration-200`}
    >
      {/* Gradient glow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${a.gradient} pointer-events-none`} />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {label}
          </p>
          <div className={`p-2.5 rounded-xl ${a.iconBg}`}>
            <span className={a.iconText}>{icon}</span>
          </div>
        </div>
        <p className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
};
