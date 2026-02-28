import { Input } from '../../ui/Input';
import { useTranslation } from '../../../hooks/useTranslation';

export interface CompanyData {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
}

interface CompanyInfoStepProps {
  data: CompanyData;
  onChange: (data: CompanyData) => void;
}

export const CompanyInfoStep = ({ data, onChange }: CompanyInfoStepProps) => {
  const { t } = useTranslation();

  const handleChange = (field: keyof CompanyData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <Input
        label={t('settings.companyName')}
        placeholder={t('settings.companyNamePlaceholder')}
        value={data.companyName}
        onChange={(e) => handleChange('companyName', e.target.value)}
        required
      />
      <Input
        label={t('settings.companyEmail')}
        placeholder={t('settings.companyEmailPlaceholder')}
        type="email"
        value={data.companyEmail}
        onChange={(e) => handleChange('companyEmail', e.target.value)}
      />
      <Input
        label={t('settings.companyPhone')}
        placeholder={t('settings.companyPhonePlaceholder')}
        type="tel"
        value={data.companyPhone}
        onChange={(e) => handleChange('companyPhone', e.target.value)}
      />
      <Input
        label={t('settings.companyAddress')}
        placeholder={t('settings.companyAddressPlaceholder')}
        value={data.companyAddress}
        onChange={(e) => handleChange('companyAddress', e.target.value)}
      />
    </div>
  );
};
