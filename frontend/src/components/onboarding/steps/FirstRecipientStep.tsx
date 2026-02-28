import { Input } from '../../ui/Input';
import { useTranslation } from '../../../hooks/useTranslation';

export interface RecipientData {
  name: string;
  email: string;
  phone: string;
}

interface FirstRecipientStepProps {
  data: RecipientData;
  onChange: (data: RecipientData) => void;
}

export const FirstRecipientStep = ({ data, onChange }: FirstRecipientStepProps) => {
  const { t } = useTranslation();

  const handleChange = (field: keyof RecipientData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <Input
        label={t('recipients.name')}
        placeholder={t('recipients.recipientName')}
        value={data.name}
        onChange={(e) => handleChange('name', e.target.value)}
        required
      />
      <Input
        label={t('recipients.email')}
        placeholder="email@example.com"
        type="email"
        value={data.email}
        onChange={(e) => handleChange('email', e.target.value)}
      />
      <Input
        label={t('recipients.phone')}
        placeholder="+380..."
        type="tel"
        value={data.phone}
        onChange={(e) => handleChange('phone', e.target.value)}
      />
    </div>
  );
};
