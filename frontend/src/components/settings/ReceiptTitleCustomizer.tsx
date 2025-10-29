import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { FileText, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../lib/api';
import { useTranslation } from '../../hooks/useTranslation';

export const ReceiptTitleCustomizer: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['receiptTitle'],
    queryFn: async () => {
      const response = await settingsApi.getReceiptTitle();
      return response.data;
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (data?.title !== undefined) {
      setTitle(data.title || 'Invoice');
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (newTitle: string) => settingsApi.updateReceiptTitle(newTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receiptTitle'] });
      toast.success(t('settings.receiptTitleUpdated') || 'Receipt title updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t('settings.receiptTitleUpdateFailed') || 'Failed to update');
    },
  });

  const isSaving = mutation.isPending;

  return (
    <Card>
      <div className="mb-6">
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.receiptTitle') || 'Receipt Title'}</h3>
        </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {t('settings.receiptTitleHint') || 'This title appears across all templates.'}
      </p>

      {isLoading ? (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
          {t('common.loading') || 'Loading...'}
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label={t('settings.receiptTitle') || 'Receipt Title'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('settings.receiptTitlePlaceholder') || 'e.g., Invoice / Tax Invoice / Receipt'}
            disabled={!isEditing}
          />

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => { setTitle(data?.title || 'Invoice'); setIsEditing(false); }} disabled={isSaving} className="flex items-center space-x-2">
                  <X className="h-4 w-4" />
                  <span>{t('common.cancel') || 'Cancel'}</span>
                </Button>
                <Button onClick={() => { mutation.mutate(title); setIsEditing(false); }} disabled={isSaving} className="flex items-center space-x-2">
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save')}</span>
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setIsEditing(true)} className="flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>{t('common.edit') || 'Edit'}</span>
              </Button>
            )}
          </div>
        </div>
      )}
      </div>
    </Card>
  );
};


