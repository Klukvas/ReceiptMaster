import { LogoUpload } from '../components/LogoUpload';

export const SettingsPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-gray-600">
          Управление настройками системы и внешним видом документов
        </p>
      </div>

      <LogoUpload />
    </div>
  );
};
