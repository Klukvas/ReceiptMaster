import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useTheme } from '../../hooks/useTheme';

const languages = [
  { code: 'en', name: 'English', shortName: 'EN', flag: '🇺🇸' },
  { code: 'ru', name: 'Русский', shortName: 'RU', flag: '🇷🇺' },
  { code: 'uk', name: 'Українська', shortName: 'UK', flag: '🇺🇦' },
] as const;

interface LanguageSwitcherProps {
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ compact = false }) => {
  const { changeLanguage, currentLanguage } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="relative inline-block">
      <select
        value={currentLanguage}
        onChange={(e) => changeLanguage(e.target.value as 'en' | 'ru' | 'uk')}
        className={`appearance-none border rounded-md py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 w-full min-w-0 ${
          compact ? 'px-2 pr-6' : 'px-3 pr-8'
        } ${
          isDark
            ? 'bg-gray-800 border-gray-600 text-gray-100'
            : 'bg-white border-gray-300 text-gray-900'
        }`}
      >
        {languages.map((lang) => (
          <option
            key={lang.code}
            value={lang.code}
            className={isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'}
          >
            {lang.flag} {compact ? lang.shortName : lang.name}
          </option>
        ))}
      </select>
      <div className={`absolute inset-y-0 right-0 flex items-center pointer-events-none ${compact ? 'pr-1' : 'pr-2'}`}>
        <svg
          className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
};
