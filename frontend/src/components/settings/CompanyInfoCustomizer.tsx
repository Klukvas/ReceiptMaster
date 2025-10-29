import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { useTranslation } from '../../hooks/useTranslation';

export const CompanyInfoCustomizer = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    companyName: '',
    companyAddress: '',
    companyEmail: '',
    companyPhone: '',
    companyTaxId: '',
    companyIban: '',
    companySwift: '',
    companyWebsite: '',
    companyTagline: '',
  });

  // Get current company info
  const { data, isLoading } = useQuery({
    queryKey: ['companyInfo'],
    queryFn: async () => {
      const response = await settingsApi.getCompanyInfo();
      return response.data.data;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Update form data when settings are loaded
  useEffect(() => {
    if (data) {
      setFormData({
        companyName: data.companyName || '',
        companyAddress: data.companyAddress || '',
        companyEmail: data.companyEmail || '',
        companyPhone: data.companyPhone || '',
        companyTaxId: data.companyTaxId || '',
        companyIban: data.companyIban || '',
        companySwift: data.companySwift || '',
        companyWebsite: data.companyWebsite || '',
        companyTagline: data.companyTagline || '',
      });
    }
  }, [data]);

  // Update mutation
  const updateCompanyInfoMutation = useMutation({
    mutationFn: (companyInfo: typeof formData) => settingsApi.updateCompanyInfo(companyInfo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companyInfo'] });
      toast.success(t('settings.companyInfoUpdated') || 'Company information updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || t('settings.companyInfoUpdateFailed') || 'Failed to update company information');
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
    updateCompanyInfoMutation.mutate(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset to current values
    if (data) {
      setFormData({
        companyName: data.companyName || '',
        companyAddress: data.companyAddress || '',
        companyEmail: data.companyEmail || '',
        companyPhone: data.companyPhone || '',
        companyTaxId: data.companyTaxId || '',
        companyIban: data.companyIban || '',
        companySwift: data.companySwift || '',
        companyWebsite: data.companyWebsite || '',
        companyTagline: data.companyTagline || '',
      });
    }
    setIsEditing(false);
  };

  const isSaving = updateCompanyInfoMutation.isPending;

  return (
    <Card
      title={
        <div className="flex items-center space-x-2">
          <Building2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <span>{t('settings.companyInformation') || 'Company Information'}</span>
        </div>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {t('settings.companyInformationDescription') || 'Manage your company details that appear on invoices and receipts'}
      </p>
      {isLoading ? (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
          {t('common.loading') || 'Loading...'}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label={t('settings.companyName') || 'Company Name'}
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                placeholder={t('settings.companyNamePlaceholder') || 'e.g., Acme Inc.'}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Input
                label={t('settings.companyTagline') || 'Company Tagline'}
                name="companyTagline"
                value={formData.companyTagline}
                onChange={handleInputChange}
                placeholder={t('settings.companyTaglinePlaceholder') || 'e.g., Quality since 1990'}
                disabled={!isEditing}
              />
            </div>

            <div className="md:col-span-2">
              <Input
                label={t('settings.companyAddress') || 'Company Address'}
                name="companyAddress"
                value={formData.companyAddress}
                onChange={handleInputChange}
                placeholder={t('settings.companyAddressPlaceholder') || 'e.g., 123 Main St, City, Country'}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Input
                label={t('settings.companyEmail') || 'Company Email'}
                name="companyEmail"
                type="email"
                value={formData.companyEmail}
                onChange={handleInputChange}
                placeholder={t('settings.companyEmailPlaceholder') || 'e.g., info@company.com'}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Input
                label={t('settings.companyPhone') || 'Company Phone'}
                name="companyPhone"
                value={formData.companyPhone}
                onChange={handleInputChange}
                placeholder={t('settings.companyPhonePlaceholder') || 'e.g., +1 234 567 8900'}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Input
                label={t('settings.companyWebsite') || 'Company Website'}
                name="companyWebsite"
                value={formData.companyWebsite}
                onChange={handleInputChange}
                placeholder={t('settings.companyWebsitePlaceholder') || 'e.g., www.company.com'}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Input
                label={t('settings.companyTaxId') || 'Tax ID / VAT ID'}
                name="companyTaxId"
                value={formData.companyTaxId}
                onChange={handleInputChange}
                placeholder={t('settings.companyTaxIdPlaceholder') || 'e.g., UA1234567890'}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Input
                label={t('settings.companyIban') || 'IBAN'}
                name="companyIban"
                value={formData.companyIban}
                onChange={handleInputChange}
                placeholder={t('settings.companyIbanPlaceholder') || 'e.g., UA213996220000026007233566001'}
                disabled={!isEditing}
              />
            </div>

            <div>
              <Input
                label={t('settings.companySwift') || 'SWIFT / BIC'}
                name="companySwift"
                value={formData.companySwift}
                onChange={handleInputChange}
                placeholder={t('settings.companySwiftPlaceholder') || 'e.g., BANKUA2X'}
                disabled={!isEditing}
              />
            </div>
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
                <Building2 className="h-4 w-4" />
                <span>{t('common.edit') || 'Edit'}</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

