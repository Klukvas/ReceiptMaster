import { useState } from 'react';
import { Building2, Palette, Globe, Wrench, Settings } from 'lucide-react';
import { LogoUpload } from '../components/settings/LogoUpload';
import { CompanyInfoCustomizer } from '../components/settings/CompanyInfoCustomizer';
import { TemplateSelector } from '../components/settings/TemplateSelector';
import { LanguageSelector } from '../components/settings/LanguageSelector';
import { ReceiptTitleCustomizer } from '../components/settings/ReceiptTitleCustomizer';
import { FooterCustomizer } from '../components/settings/FooterCustomizer';
import { TestReceiptButton } from '../components/settings/TestReceiptButton';
import { useTranslation } from '../hooks/useTranslation';

type SettingsTab = 'company' | 'receipt' | 'language' | 'advanced';

export const SettingsPage = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');

  const tabs: { key: SettingsTab; label: string; icon: typeof Building2 }[] = [
    { key: 'company', label: t('settings.tabCompany', 'Company Info'), icon: Building2 },
    { key: 'receipt', label: t('settings.tabReceipt', 'Receipt Design'), icon: Palette },
    { key: 'language', label: t('settings.tabLanguage', 'Language'), icon: Globe },
    { key: 'advanced', label: t('settings.tabAdvanced', 'Advanced'), icon: Wrench },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
            <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('settings.title', 'Settings')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('settings.subtitle', 'System settings and document appearance management')}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700/60">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Settings tabs">
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`group relative flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white dark:bg-gray-800/80 text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-700/60 border-b-white dark:border-b-gray-800/80 -mb-px'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/30'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'}`} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-5">
        {activeTab === 'company' && (
          <>
            <LogoUpload />
            <CompanyInfoCustomizer />
          </>
        )}

        {activeTab === 'receipt' && (
          <>
            <ReceiptTitleCustomizer />
            <TemplateSelector />
            <FooterCustomizer />
            <TestReceiptButton />
          </>
        )}

        {activeTab === 'language' && <LanguageSelector />}

        {activeTab === 'advanced' && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700/50 mb-4">
              <Wrench className="h-7 w-7 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {t('settings.advancedTitle', 'Advanced Settings Coming Soon')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
              {t('settings.advancedDescription', 'This section will include API keys, webhooks, data export options, and more.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
