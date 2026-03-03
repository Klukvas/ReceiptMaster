import { Eye, Edit, Trash2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { PortalDropdown, DropdownItem, DropdownDivider } from '../ui/PortalDropdown';
import type { Recipient } from '../../lib/api';

interface RecipientActionsMenuProps {
 recipient: Recipient;
 onView: (recipient: Recipient) => void;
 onEdit: (recipient: Recipient) => void;
 onDelete: (recipient: Recipient) => void;
 isDeleting?: boolean;
}

export const RecipientActionsMenu = ({
 recipient,
 onView,
 onEdit,
 onDelete,
 isDeleting = false,
}: RecipientActionsMenuProps) => {
 const { t } = useTranslation();

 return (
 <PortalDropdown buttonTitle={t('common.actions')}>
 {(close: () => void) => (
 <>
 <DropdownItem
 icon={<Eye className="w-3.5 h-3.5" />}
 label={t('recipients.viewDetails')}
 onClick={() => { onView(recipient); close(); }}
 />
 <DropdownItem
 icon={<Edit className="w-3.5 h-3.5" />}
 label={t('common.edit')}
 onClick={() => { onEdit(recipient); close(); }}
 />
 <DropdownDivider />
 <DropdownItem
 icon={<Trash2 className="w-3.5 h-3.5" />}
 label={t('common.delete')}
 onClick={() => { onDelete(recipient); close(); }}
 variant="danger"
 disabled={isDeleting}
 />
 </>
 )}
 </PortalDropdown>
 );
};
