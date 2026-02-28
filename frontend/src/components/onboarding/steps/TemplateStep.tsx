import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { settingsApi } from '../../../lib/api';
import { useTranslation } from '../../../hooks/useTranslation';
import { TemplatePreviewIframe } from '../../settings/TemplatePreviewIframe';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  features: string[];
  colors: { primary: string; secondary: string; accent: string };
}

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  business: { label: 'Business', className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  creative: { label: 'Creative', className: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' },
  minimal: { label: 'Minimal', className: 'bg-gray-50 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300' },
  premium: { label: 'Premium', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
};

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UK' },
  { code: 'ru', label: 'RU' },
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

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ['availableTemplates'],
    queryFn: async () => {
      const response = await settingsApi.getAvailableTemplates();
      const payload = response?.data;
      const normalized =
        payload && typeof payload === 'object' && 'data' in payload
          ? (payload as Record<string, unknown>).data
          : payload;
      return Array.isArray(normalized) ? (normalized as Template[]) : [];
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-48 rounded-xl bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Language selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('settings.languageTitle')}
        </label>
        <div className="flex gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => onChange({ ...data, templateLanguage: lang.code })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                data.templateLanguage === lang.code
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
          const category = CATEGORY_STYLES[template.category] || CATEGORY_STYLES.business;

          return (
            <div
              key={template.id}
              onClick={() => onChange({ ...data, templateId: template.id })}
              className={`group relative rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                  : 'border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white z-10">
                  <Check className="h-3 w-3" />
                </div>
              )}

              <div className="mb-2 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700/40">
                <TemplatePreviewIframe
                  templateId={template.id}
                  language={data.templateLanguage}
                  height={100}
                />
              </div>

              <h3 className="font-medium text-gray-900 dark:text-white text-xs truncate">
                {template.name}
              </h3>

              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${category.className}`}>
                  {category.label}
                </span>
                <div className="flex gap-0.5">
                  {[template.colors.primary, template.colors.secondary, template.colors.accent].map((color, i) => (
                    <div
                      key={i}
                      className="w-3 h-3 rounded-full border border-gray-200 dark:border-gray-600"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
