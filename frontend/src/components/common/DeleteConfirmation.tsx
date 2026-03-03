import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useTranslation } from '../../hooks/useTranslation';

interface DeleteConfirmationProps {
 isOpen: boolean;
 onClose: () => void;
 onConfirm: () => void;
 title: string;
 message: string;
 itemName?: string;
 isLoading?: boolean;
}

export const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
 isOpen,
 onClose,
 onConfirm,
 title,
 message,
 itemName,
 isLoading = false,
}) => {
 const { t } = useTranslation();

 return (
 <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" showCloseButton>
 <div className="flex gap-4">
 <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-danger-light)] flex items-center justify-center">
 <AlertTriangle className="w-5 h-5 text-danger-base" aria-hidden />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-content-secondary mb-2">{message}</p>
 {itemName && (
 <p className="text-sm text-content-tertiary">
 <strong>{t('common.item')}:</strong> {itemName}
 </p>
 )}
 </div>
 </div>
 <div className="flex justify-end gap-3 mt-6">
 <Button variant="secondary" onClick={onClose} disabled={isLoading}>
 {t('common.cancel')}
 </Button>
 <Button variant="danger" onClick={onConfirm} disabled={isLoading}>
 {isLoading ? t('common.deleting') : t('common.delete')}
 </Button>
 </div>
 </Modal>
 );
};
