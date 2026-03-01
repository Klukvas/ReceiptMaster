import { Edit, Trash2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { PortalDropdown, DropdownItem, DropdownDivider } from '../ui/PortalDropdown';
import type { Product } from '../../lib/api';

interface ProductActionsMenuProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  isDeleting?: boolean;
}

export const ProductActionsMenu = ({
  product,
  onEdit,
  onDelete,
  isDeleting = false,
}: ProductActionsMenuProps) => {
  const { t } = useTranslation();

  return (
    <PortalDropdown buttonTitle={t('common.actions')}>
      {(close: () => void) => (
        <>
          <DropdownItem
            icon={<Edit className="w-3.5 h-3.5" />}
            label={t('common.edit')}
            onClick={() => { onEdit(product); close(); }}
          />
          <DropdownDivider />
          <DropdownItem
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label={t('common.delete')}
            onClick={() => { onDelete(product); close(); }}
            variant="danger"
            disabled={isDeleting}
          />
        </>
      )}
    </PortalDropdown>
  );
};
