import { LogoUpload } from '../components/settings/LogoUpload';

export const SettingsPage = () => {

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Настройки</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Управление настройками системы и внешним видом документов
        </p>
      </div>

      <LogoUpload />
    </div>
  );
};
