import { LogoUpload } from '../components/settings/LogoUpload';
import { CompanyInfoCustomizer } from '../components/settings/CompanyInfoCustomizer';
import { TemplateSelector } from '../components/settings/TemplateSelector';
import { LanguageSelector } from '../components/settings/LanguageSelector';
import { ReceiptTitleCustomizer } from '../components/settings/ReceiptTitleCustomizer';
import { FooterCustomizer } from '../components/settings/FooterCustomizer';
import { useTranslation } from '../hooks/useTranslation';

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>
        <p className="text-gray-600 dark:text-gray-300">
          {t('settings.subtitle')}
        </p>
      </div>

      <LogoUpload />
      <CompanyInfoCustomizer />
      <ReceiptTitleCustomizer />
      <TemplateSelector />
      <LanguageSelector />
      <FooterCustomizer />
    </div>
  );
};
