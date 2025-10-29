import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heading, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { useTranslation } from '../../hooks/useTranslation';

export const HeaderCustomizer = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    headerTitle: '',
  });

  // Get current header settings
  const { data: headerTitleData, isLoading } = useQuery({
    queryKey: ['headerTitle'],
    queryFn: () => settingsApi.getHeaderTitle(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Update form data when settings are loaded
  useEffect(() => {
    if (headerTitleData?.data?.headerTitle !== undefined) {
      setFormData({
        headerTitle: headerTitleData.data.headerTitle || '',
      });
    }
  }, [headerTitleData]);

  // Update mutation
  const updateHeaderTitleMutation = useMutation({
    mutationFn: (headerTitle: string) => settingsApi.updateHeaderTitle(headerTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['headerTitle'] });
      toast.success(t('settings.headerTitleUpdated') || 'Header title updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t('settings.headerTitleUpdateFailed') || 'Failed to update header title');
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    updateHeaderTitleMutation.mutate(formData.headerTitle);
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset to current values
    setFormData({
      headerTitle: headerTitleData?.data?.headerTitle || '',
    });
    setIsEditing(false);
  };

  const isSaving = updateHeaderTitleMutation.isPending;

  return (
    <Card
      title={
        <div className="flex items-center space-x-2">
          <Heading className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <span>{t('settings.headerCustomization') || 'Header Customization'}</span>
        </div>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {t('settings.headerCustomizationDescription') || 'Customize the header title that appears on your invoices and receipts. If not set, the company name will be used.'}
      </p>
      {isLoading ? (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
          {t('common.loading') || 'Loading...'}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Input
              label={t('settings.headerTitle') || 'Header Title'}
              name="headerTitle"
              value={formData.headerTitle}
              onChange={handleInputChange}
              placeholder={t('settings.headerTitlePlaceholder') || 'e.g., Your Company Name'}
              disabled={!isEditing}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.headerTitleHint') || 'This text will appear in the header section of your receipts. Leave empty to use company name.'}
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex items-center space-x-2"
                >
                  <X className="h-4 w-4" />
                  <span>{t('common.cancel') || 'Cancel'}</span>
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save')}</span>
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-2"
              >
                <Heading className="h-4 w-4" />
                <span>{t('common.edit') || 'Edit'}</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

