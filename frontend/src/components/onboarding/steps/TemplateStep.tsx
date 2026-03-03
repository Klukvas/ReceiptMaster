import { useState } from"react";
import { useQuery } from"@tanstack/react-query";
import { Check, Lock, Crown } from"lucide-react";
import { settingsApi } from"../../../lib/api";
import { useTranslation } from"../../../hooks/useTranslation";
import { TemplatePreviewIframe } from"../../settings/TemplatePreviewIframe";
import { UpgradeModal } from"../../subscription/UpgradeModal";

interface Template {
 id: string;
 name: string;
 description: string;
 category: string;
 features: string[];
 colors: { primary: string; secondary: string; accent: string };
 locked?: boolean;
}

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
 business: {
 label:"Business",
 className:
"bg-[var(--color-accent-light)] text-accent-base",
 },
 creative: {
 label:"Creative",
 className:
"bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
 },
 minimal: {
 label:"Minimal",
 className:
"bg-surface-alt text-content-secondary",
 },
 premium: {
 label:"Premium",
 className:
"bg-[var(--color-warning-light)] text-warning-base",
 },
};

const LANGUAGES = [
 { code:"en", label:"EN" },
 { code:"uk", label:"UK" },
 { code:"ru", label:"RU" },
];

export interface TemplateData {
 templateId: string;
 templateLanguage: string;
}

interface TemplateStepProps {
 data: TemplateData;
 onChange: (data: TemplateData) => void;
}

export const TemplateStep = ({ data, onChange }: TemplateStepProps) => {
 const { t } = useTranslation();
 const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

 const { data: templates, isLoading } = useQuery<Template[]>({
 queryKey: ["availableTemplates"],
 queryFn: async () => {
 const response = await settingsApi.getAvailableTemplates();
 const payload = response?.data;
 const normalized =
 payload && typeof payload ==="object" &&"data" in payload
 ? (payload as Record<string, unknown>).data
 : payload;
 return Array.isArray(normalized) ? (normalized as Template[]) : [];
 },
 });

 if (isLoading) {
 return (
 <div className="grid grid-cols-2 gap-3">
 {[...Array(4)].map((_, i) => (
 <div
 key={i}
 className="h-48 rounded-xl bg-surface-alt animate-pulse"
 />
 ))}
 </div>
 );
 }

 return (
 <div className="space-y-4">
 {/* Language selector */}
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-2">
 {t("settings.languageTitle")}
 </label>
 <div className="flex gap-2">
 {LANGUAGES.map((lang) => (
 <button
 key={lang.code}
 type="button"
 onClick={() => onChange({ ...data, templateLanguage: lang.code })}
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
 data.templateLanguage === lang.code
 ?"bg-accent-base text-white"
 :"bg-surface-alt text-content-secondary hover:bg-surface-alt"
 }`}
 >
 {lang.label}
 </button>
 ))}
 </div>
 </div>

 {/* Template grid */}
 <div className="grid grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
 {templates?.map((template) => {
 const isSelected = data.templateId === template.id;
 const isLocked = template.locked === true;
 const category =
 CATEGORY_STYLES[template.category] || CATEGORY_STYLES.business;

 return (
 <div
 key={template.id}
 onClick={() => {
 if (isLocked) {
 setUpgradeModalOpen(true);
 return;
 }
 onChange({ ...data, templateId: template.id });
 }}
 className={`group relative rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 ${
 isLocked
 ?"border-[var(--color-border)] opacity-75"
 : isSelected
 ?"border-accent-base bg-[var(--color-accent-light)]"
 :"border-[var(--color-border)] hover:border-[var(--color-border)]"
 }`}
 >
 {/* Lock overlay */}
 {isLocked && (
 <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--color-overlay)]">
 <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium shadow-lg">
 <Crown className="h-3 w-3" />
 {t("subscription.upgradeToPro","Upgrade to Pro")}
 </div>
 </div>
 )}

 {/* Lock indicator */}
 {isLocked && (
 <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-warning-base text-white z-20">
 <Lock className="h-3 w-3" />
 </div>
 )}

 {isSelected && !isLocked && (
 <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-base text-white z-10">
 <Check className="h-3 w-3" />
 </div>
 )}

 <div className="mb-2 rounded-lg overflow-hidden border border-[var(--color-border-light)]">
 <TemplatePreviewIframe
 templateId={template.id}
 language={data.templateLanguage}
 height={100}
 />
 </div>

 <h3 className="font-medium text-content text-xs truncate">
 {template.name}
 </h3>

 <div className="flex items-center gap-1.5 mt-1">
 <span
 className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${category.className}`}
 >
 {category.label}
 </span>
 <div className="flex gap-0.5">
 {[
 template.colors.primary,
 template.colors.secondary,
 template.colors.accent,
 ].map((color, i) => (
 <div
 key={i}
 className="w-3 h-3 rounded-full border border-[var(--color-border)]"
 style={{ backgroundColor: color }}
 />
 ))}
 </div>
 </div>
 </div>
 );
 })}
 </div>

 <UpgradeModal
 isOpen={upgradeModalOpen}
 onClose={() => setUpgradeModalOpen(false)}
 reason="templates"
 />
 </div>
 );
};
