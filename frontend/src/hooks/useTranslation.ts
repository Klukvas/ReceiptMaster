import { useTranslation as useI18nTranslation } from 'react-i18next';

export const useTranslation = () => {
  const { t, i18n } = useI18nTranslation();

  const changeLanguage = (language: 'en' | 'ru' | 'uk') => {
    i18n.changeLanguage(language);
  };

  const currentLanguage = i18n.language as 'en' | 'ru' | 'uk';

  return {
    t,
    changeLanguage,
    currentLanguage,
    isReady: i18n.isInitialized,
  };
};
