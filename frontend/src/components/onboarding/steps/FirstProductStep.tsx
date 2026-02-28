import { Input } from '../../ui/Input';
import { useTranslation } from '../../../hooks/useTranslation';

export interface ProductData {
  name: string;
  purchase_price: string;
  sale_price: string;
  quantity: string;
}

interface FirstProductStepProps {
  data: ProductData;
  onChange: (data: ProductData) => void;
}

export const FirstProductStep = ({ data, onChange }: FirstProductStepProps) => {
  const { t } = useTranslation();

  const handleChange = (field: keyof ProductData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <Input
        label={t('products.productName')}
        placeholder={t('products.productName')}
        value={data.name}
        onChange={(e) => handleChange('name', e.target.value)}
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label={`${t('products.purchasePrice')} (UAH)`}
          placeholder="0.00"
          type="number"
          step="0.01"
          min="0"
          value={data.purchase_price}
          onChange={(e) => handleChange('purchase_price', e.target.value)}
        />
        <Input
          label={`${t('products.salePrice')} (UAH)`}
          placeholder="0.00"
          type="number"
          step="0.01"
          min="0"
          value={data.sale_price}
          onChange={(e) => handleChange('sale_price', e.target.value)}
        />
      </div>
      <Input
        label={t('products.quantity')}
        placeholder="0"
        type="number"
        min="0"
        value={data.quantity}
        onChange={(e) => handleChange('quantity', e.target.value)}
      />
    </div>
  );
};
