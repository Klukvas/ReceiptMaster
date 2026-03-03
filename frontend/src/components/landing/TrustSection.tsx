import React from 'react';
import { Shield, Clock, Lock, Database } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

export const TrustSection: React.FC = () => {
 const { t } = useTranslation();

 const badges = [
 { icon: Shield, label: t('landing.trust.gdpr') },
 { icon: Clock, label: t('landing.trust.uptime') },
 { icon: Lock, label: t('landing.trust.encrypted') },
 { icon: Database, label: t('landing.trust.multiTenant') },
 ];

 return (
 <section className="py-12 border-y border-[var(--color-border-light)] bg-surface-alt">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 lg:gap-12">
 <span className="text-xs font-medium text-content-tertiary uppercase tracking-wider whitespace-nowrap">
 {t('landing.trust.badge')}
 </span>
 <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 lg:gap-8">
 {badges.map((badge) => (
 <div
 key={badge.label}
 className="flex items-center gap-2 text-content-tertiary"
 >
 <badge.icon className="h-4 w-4 text-content-tertiary" />
 <span className="text-sm font-medium">{badge.label}</span>
 </div>
 ))}
 </div>
 </div>
 </div>
 </section>
 );
};
