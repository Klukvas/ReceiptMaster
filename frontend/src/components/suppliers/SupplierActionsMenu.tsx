import { Eye, Edit, Trash2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { PortalDropdown, DropdownItem, DropdownDivider } from '../ui/PortalDropdown';
import type { Supplier } from '../../lib/api';

interface SupplierActionsMenuProps {
  supplier: Supplier;
  onView: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
  isDeleting?: boolean;
}

export const SupplierActionsMenu = ({
  supplier,
  onView,
  onEdit,
  onDelete,
  isDeleting = false,
}: SupplierActionsMenuProps) => {
  const { t } = useTranslation();

  return (
    <PortalDropdown buttonTitle={t('common.actions')}>
      {(close: () => void) => (
        <>
          <DropdownItem
            icon={<Eye className="w-3.5 h-3.5" />}
            label={t('suppliers.viewDetails')}
            onClick={() => { onView(supplier); close(); }}
          />
          <DropdownItem
            icon={<Edit className="w-3.5 h-3.5" />}
            label={t('common.edit')}
            onClick={() => { onEdit(supplier); close(); }}
          />
          <DropdownDivider />
          <DropdownItem
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label={t('common.delete')}
            onClick={() => { onDelete(supplier); close(); }}
            variant="danger"
            disabled={isDeleting}
          />
        </>
      )}
    </PortalDropdown>
  );
};
