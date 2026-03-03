import React from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';

interface HeroSectionProps {
 onOpenRegister: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenRegister }) => {
 const { t } = useTranslation();
 const { isAuthenticated } = useAuth();

 return (
 <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
 {/* Left — Copy */}
 <div className="max-w-xl">
 <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-accent-light)] border border-[var(--color-accent-light)] text-accent-base text-xs font-medium mb-6 landing-fade-in">
 <span className="w-1.5 h-1.5 rounded-full bg-accent-base animate-pulse" />
 {t('landing.hero.badge')}
 </div>

 {isAuthenticated ? (
 <>
 <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-content leading-[1.1] tracking-tight mb-6 landing-fade-in landing-delay-1">
 {t('landing.hero.welcomeBack')}
 </h1>
 <p className="text-lg sm:text-xl text-content-secondary leading-relaxed mb-8 landing-fade-in landing-delay-2">
 {t('landing.hero.welcomeBackSubtitle')}
 </p>
 <div className="flex flex-col sm:flex-row gap-3 landing-fade-in landing-delay-3">
 <Button
 size="lg"
 className="bg-accent-base text-white hover:bg-accent-base-hover px-6 py-3 rounded-lg font-medium shadow-sm inline-flex items-center gap-2 group"
 onClick={() => window.location.href = '/dashboard'}
 >
 {t('landing.hero.goToDashboard')}
 <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
 </Button>
 </div>
 </>
 ) : (
 <>
 <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-content leading-[1.1] tracking-tight mb-6 landing-fade-in landing-delay-1">
 {t('landing.hero.title')}
 <span className="text-accent-base">
 {' '}{t('landing.hero.titleHighlight')}
 </span>
 </h1>
 <p className="text-lg sm:text-xl text-content-secondary leading-relaxed mb-8 landing-fade-in landing-delay-2">
 {t('landing.hero.subtitle')}
 </p>
 <div className="flex flex-col sm:flex-row gap-3 landing-fade-in landing-delay-3">
 <Button
 size="lg"
 className="bg-accent-base text-white hover:bg-accent-base-hover px-6 py-3 rounded-lg font-medium shadow-sm inline-flex items-center gap-2 group"
 onClick={onOpenRegister}
 >
 {t('landing.hero.startFree')}
 <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
 </Button>
 <Button
 variant="outline"
 size="lg"
 className="border-[var(--color-border)] text-content-secondary hover:bg-surface-alt px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2"
 onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
 >
 <Play className="h-4 w-4" />
 {t('landing.hero.viewDemo')}
 </Button>
 </div>
 </>
 )}
 </div>

 {/* Right — Dashboard Mockup */}
 <div className="relative landing-fade-in landing-delay-2 hidden lg:block">
 <div className="relative">
 {/* Subtle glow behind card */}
 <div className="absolute -inset-4 bg-accent-base/5 rounded-3xl blur-2xl" />

 {/* Dashboard preview card */}
 <div className="relative bg-elevated rounded-xl border border-[var(--color-border)] shadow-xl overflow-hidden">
 {/* Window chrome */}
 <div className="flex items-center gap-2 px-4 py-3 bg-surface-alt border-b border-[var(--color-border)]">
 <div className="flex gap-1.5">
 <div className="w-3 h-3 rounded-full bg-danger-base" />
 <div className="w-3 h-3 rounded-full bg-warning-base" />
 <div className="w-3 h-3 rounded-full bg-success-base" />
 </div>
 <div className="flex-1 flex justify-center">
 <div className="px-4 py-1 bg-surface-alt rounded text-xs text-content-tertiary font-mono">
 app.receiptmaster.io/dashboard
 </div>
 </div>
 </div>

 {/* Dashboard content mockup */}
 <div className="p-6 space-y-4">
 {/* Stat cards row */}
 <div className="grid grid-cols-3 gap-3">
 {[
 { label: 'Revenue', value: '24,580', color: 'text-success-base' },
 { label: 'Orders', value: '142', color: 'text-accent-base' },
 { label: 'Receipts', value: '98', color: 'text-purple-600 dark:text-purple-400' },
 ].map((stat) => (
 <div key={stat.label} className="bg-surface-alt rounded-lg p-3 border border-[var(--color-border-light)]">
 <div className="text-xs text-content-tertiary mb-1">{stat.label}</div>
 <div className={`text-lg font-semibold ${stat.color}`}>{stat.value}</div>
 </div>
 ))}
 </div>

 {/* Chart placeholder */}
 <div className="bg-surface-alt rounded-lg p-4 border border-[var(--color-border-light)]">
 <div className="text-xs text-content-tertiary mb-3">Revenue — Last 7 days</div>
 <div className="flex items-end gap-1.5 h-20">
 {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
 <div
 key={i}
 className="flex-1 bg-accent-base/20 rounded-t"
 style={{ height: `${h}%` }}
 >
 <div
 className="w-full bg-accent-base rounded-t transition-all duration-500"
 style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
 />
 </div>
 ))}
 </div>
 </div>

 {/* Table preview */}
 <div className="bg-surface-alt rounded-lg border border-[var(--color-border-light)] overflow-hidden">
 <div className="px-3 py-2 text-xs text-content-tertiary border-b border-[var(--color-border-light)]">
 Recent Orders
 </div>
 {[1, 2, 3].map((i) => (
 <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border-light)] last:border-0">
 <div className="w-16 h-2.5 bg-surface-alt rounded" />
 <div className="flex-1 h-2.5 bg-surface-alt rounded" />
 <div className={`px-2 py-0.5 rounded text-[10px] font-medium ${
 i === 1 ? 'bg-[var(--color-success-light)] text-success-base' :
 i === 2 ? 'bg-[var(--color-accent-light)] text-accent-base' :
 'bg-surface-alt text-content-secondary'
 }`}>
 {i === 1 ? 'Confirmed' : i === 2 ? 'Draft' : 'Pending'}
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </section>
 );
};
