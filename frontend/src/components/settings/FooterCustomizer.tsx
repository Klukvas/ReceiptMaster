import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { useTranslation } from '../../hooks/useTranslation';

export const FooterCustomizer = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    footerTitle: '',
    footerSubtitle: '',
  });

  // Get current footer settings
  const { data: footerTitleData, isLoading: isLoadingTitle } = useQuery({
    queryKey: ['footerTitle'],
    queryFn: () => settingsApi.getFooterTitle(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const { data: footerSubtitleData, isLoading: isLoadingSubtitle } = useQuery({
    queryKey: ['footerSubtitle'],
    queryFn: () => settingsApi.getFooterSubtitle(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Update form data when settings are loaded
  useEffect(() => {
    if (footerTitleData?.data?.footerTitle !== undefined) {
      setFormData(prev => ({
        ...prev,
        footerTitle: footerTitleData.data.footerTitle || '',
      }));
    }
  }, [footerTitleData]);

  useEffect(() => {
    if (footerSubtitleData?.data?.footerSubtitle !== undefined) {
      setFormData(prev => ({
        ...prev,
        footerSubtitle: footerSubtitleData.data.footerSubtitle || '',
      }));
    }
  }, [footerSubtitleData]);

  // Update mutations
  const updateFooterTitleMutation = useMutation({
    mutationFn: (footerTitle: string) => settingsApi.updateFooterTitle(footerTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['footerTitle'] });
      toast.success(t('settings.footerTitleUpdated') || 'Footer title updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t('settings.footerTitleUpdateFailed') || 'Failed to update footer title');
    },
  });

  const updateFooterSubtitleMutation = useMutation({
    mutationFn: (footerSubtitle: string) => settingsApi.updateFooterSubtitle(footerSubtitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['footerSubtitle'] });
      toast.success(t('settings.footerSubtitleUpdated') || 'Footer subtitle updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t('settings.footerSubtitleUpdateFailed') || 'Failed to update footer subtitle');
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
    updateFooterTitleMutation.mutate(formData.footerTitle);
    updateFooterSubtitleMutation.mutate(formData.footerSubtitle);
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset to current values
    setFormData({
      footerTitle: footerTitleData?.data?.footerTitle || '',
      footerSubtitle: footerSubtitleData?.data?.footerSubtitle || '',
    });
    setIsEditing(false);
  };

  const isLoading = isLoadingTitle || isLoadingSubtitle;
  const isSaving = updateFooterTitleMutation.isPending || updateFooterSubtitleMutation.isPending;

  return (
    <Card
      title={
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <span>{t('settings.footerCustomization') || 'Footer Customization'}</span>
        </div>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {t('settings.footerCustomizationDescription') || 'Customize the footer title and subtitle that appear on your invoices and receipts'}
      </p>
      {isLoading ? (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
          {t('common.loading') || 'Loading...'}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Input
              label={t('settings.footerTitle') || 'Footer Title'}
              name="footerTitle"
              value={formData.footerTitle}
              onChange={handleInputChange}
              placeholder={t('settings.footerTitlePlaceholder') || 'e.g., Thank you for your purchase!'}
              disabled={!isEditing}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.footerTitleHint') || 'This text will appear as the main footer title on your receipts'}
            </p>
          </div>

          <div>
            <Input
              label={t('settings.footerSubtitle') || 'Footer Subtitle'}
              name="footerSubtitle"
              value={formData.footerSubtitle}
              onChange={handleInputChange}
              placeholder={t('settings.footerSubtitlePlaceholder') || 'e.g., If you have any questions, please contact us.'}
              disabled={!isEditing}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.footerSubtitleHint') || 'This text will appear as the footer subtitle on your receipts'}
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
                <FileText className="h-4 w-4" />
                <span>{t('common.edit') || 'Edit'}</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

