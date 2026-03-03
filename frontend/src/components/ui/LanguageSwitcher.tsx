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
 className={`appearance-none border rounded-md py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base transition-colors duration-200 w-full min-w-0 ${
 compact ? 'px-2 pr-6' : 'px-3 pr-8'
 } ${
 isDark
 ? 'bg-surface border-[var(--color-border)] text-content'
 : 'bg-elevated border-[var(--color-border)] text-content'
 }`}
 >
 {languages.map((lang) => (
 <option
 key={lang.code}
 value={lang.code}
 className={isDark ? 'bg-surface text-content' : 'bg-elevated text-content'}
 >
 {lang.flag} {compact ? lang.shortName : lang.name}
 </option>
 ))}
 </select>
 <div className={`absolute inset-y-0 right-0 flex items-center pointer-events-none ${compact ? 'pr-1' : 'pr-2'}`}>
 <svg
 className={`w-4 h-4 ${isDark ? 'text-content-tertiary' : 'text-content-tertiary'}`}
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
