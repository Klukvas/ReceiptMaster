import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTranslation } from '../../hooks/useTranslation';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
];

export const LanguageSelector = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  // Get current language setting
  const { data: currentLanguage, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ['templateLanguage'],
    queryFn: () => settingsApi.getTemplateLanguage(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Update language setting
  const updateLanguageMutation = useMutation({
    mutationFn: (language: string) => settingsApi.updateTemplateLanguage(language),
    onSuccess: (data, language) => {
      console.log('Language update successful, language:', language);
      queryClient.invalidateQueries({ queryKey: ['templateLanguage'] });
      setSelectedLanguage('');
      toast.success('Язык шаблона успешно обновлен');
    },
    onError: (error: any) => {
      console.error('Language update error:', error);
      toast.error(error.response?.data?.message || 'Ошибка при обновлении языка');
    },
  });

  // Update selected language when current language changes
  useEffect(() => {
    const language = currentLanguage?.data?.language;
    if (language && !selectedLanguage) {
      console.log('Setting selected language from current language:', language);
      setSelectedLanguage(language);
    }
  }, [currentLanguage, selectedLanguage]);

  const handleLanguageSelect = (languageCode: string) => {
    setSelectedLanguage(languageCode);
  };

  const handleSaveLanguage = () => {
    if (selectedLanguage) {
      updateLanguageMutation.mutate(selectedLanguage);
    }
  };

  if (isLoadingCurrent) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  const currentLanguageCode = currentLanguage?.data?.language || 'en';
  const selectedLanguageCode = selectedLanguage || currentLanguageCode;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Globe className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Язык шаблона
        </h2>
      </div>

      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Выберите язык для отображения текста в шаблонах чеков и инвойсов.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {LANGUAGES.map((language) => (
          <div
            key={language.code}
            className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all ${
              selectedLanguageCode === language.code
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            onClick={() => handleLanguageSelect(language.code)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{language.flag}</span>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {language.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {language.code.toUpperCase()}
                  </p>
                </div>
              </div>
              {selectedLanguageCode === language.code && (
                <Check className="h-5 w-5 text-blue-600" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {selectedLanguageCode !== currentLanguageCode && (
            <span>
              Выбран новый язык: <strong>
                {LANGUAGES.find(l => l.code === selectedLanguageCode)?.name}
              </strong>
            </span>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setSelectedLanguage(currentLanguageCode)}
            disabled={selectedLanguageCode === currentLanguageCode}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSaveLanguage}
            disabled={selectedLanguageCode === currentLanguageCode || updateLanguageMutation.isPending}
            loading={updateLanguageMutation.isPending}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </Card>
  );
};
