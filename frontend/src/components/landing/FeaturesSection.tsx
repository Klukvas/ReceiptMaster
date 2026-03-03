import React from 'react';
import {
 Package,
 ShoppingCart,
 Users,
 Receipt,
 BarChart3,
 FileText,
 Send,
 Shield,
 Database,
 CheckCircle,
} from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface FeatureBlockProps {
 label: string;
 title: string;
 description: string;
 items: string[];
 icons: React.ElementType[];
 reversed?: boolean;
}

const FeatureBlock: React.FC<FeatureBlockProps> = ({
 label,
 title,
 description,
 items,
 icons,
 reversed = false,
}) => {
 return (
 <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center ${reversed ? 'lg:direction-rtl' : ''}`}>
 {/* Text block */}
 <div className={reversed ? 'lg:order-2' : ''}>
 <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-accent-light)] border border-[var(--color-accent-light)] text-accent-base text-xs font-medium mb-4">
 {label}
 </div>
 <h3 className="text-2xl sm:text-3xl font-bold text-content mb-4 leading-tight">
 {title}
 </h3>
 <p className="text-content-secondary leading-relaxed mb-6">
 {description}
 </p>
 <ul className="space-y-3">
 {items.map((item, i) => (
 <li key={i} className="flex items-start gap-3">
 <CheckCircle className="h-5 w-5 text-accent-base mt-0.5 flex-shrink-0" />
 <span className="text-content-secondary text-sm">{item}</span>
 </li>
 ))}
 </ul>
 </div>

 {/* Mini UI illustration */}
 <div className={reversed ? 'lg:order-1' : ''}>
 <div className="bg-surface-alt rounded-xl border border-[var(--color-border)] p-6 sm:p-8">
 <div className="grid grid-cols-3 gap-4">
 {icons.map((Icon, i) => (
 <div
 key={i}
 className="flex flex-col items-center gap-2 p-4 bg-elevated rounded-lg border border-[var(--color-border-light)] hover:border-[var(--color-accent-light)] transition-colors"
 >
 <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-light)] flex items-center justify-center">
 <Icon className="h-5 w-5 text-accent-base" />
 </div>
 <div className="w-full space-y-1.5">
 <div className="h-2 bg-surface-alt rounded w-full" />
 <div className="h-2 bg-surface-alt rounded w-2/3" />
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 );
};

export const FeaturesSection: React.FC = () => {
 const { t } = useTranslation();

 const features = [
 {
 label: t('landing.features.operations.label'),
 title: t('landing.features.operations.title'),
 description: t('landing.features.operations.description'),
 items: [
 t('landing.features.operations.item1'),
 t('landing.features.operations.item2'),
 t('landing.features.operations.item3'),
 ],
 icons: [Package, ShoppingCart, Users],
 reversed: false,
 },
 {
 label: t('landing.features.financial.label'),
 title: t('landing.features.financial.title'),
 description: t('landing.features.financial.description'),
 items: [
 t('landing.features.financial.item1'),
 t('landing.features.financial.item2'),
 t('landing.features.financial.item3'),
 ],
 icons: [Receipt, BarChart3, FileText],
 reversed: true,
 },
 {
 label: t('landing.features.automation.label'),
 title: t('landing.features.automation.title'),
 description: t('landing.features.automation.description'),
 items: [
 t('landing.features.automation.item1'),
 t('landing.features.automation.item2'),
 t('landing.features.automation.item3'),
 ],
 icons: [Send, Shield, Database],
 reversed: false,
 },
 ];

 return (
 <section id="features" className="py-20 lg:py-28 bg-elevated">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 {/* Section header */}
 <div className="max-w-2xl mb-16 lg:mb-20">
 <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-alt text-content-secondary text-xs font-medium mb-4">
 {t('landing.features.label')}
 </div>
 <h2 className="text-3xl sm:text-4xl font-bold text-content leading-tight">
 {t('landing.features.title')}
 </h2>
 </div>

 {/* Feature blocks */}
 <div className="space-y-20 lg:space-y-28">
 {features.map((feature, index) => (
 <FeatureBlock key={index} {...feature} />
 ))}
 </div>
 </div>
 </section>
 );
};
