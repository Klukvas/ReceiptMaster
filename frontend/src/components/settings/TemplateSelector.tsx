import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, Check, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTranslation } from '../../hooks/useTranslation';

interface Template {
  id: string;
  name: string;
  description: string;
  category: 'business' | 'creative' | 'minimal' | 'premium';
  features: string[];
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

const TEMPLATE_PREVIEWS: Record<string, string> = {
  classic: '📄',
  modern: '🎨',
  elegant: '✨',
  vintage: '📜',
  tech: '⚡',
  wave: '🌊',
  minimal: '📋',
  standard: '📊',
  compact: '📝'
};

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Деловой',
  creative: 'Креативный',
  minimal: 'Минимализм',
  premium: 'Премиум'
};

export const TemplateSelector = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Get current template setting
  const { data: currentTemplate, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ['templateSettings'],
    queryFn: () => settingsApi.getTemplateSettings(),
    staleTime: 1000 * 60 * 5, // 5 minutes - reasonable cache time
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: true, // Always refetch when component mounts
  });

  // Get available templates
  const { data: templates, isLoading: isLoadingTemplates, error: templatesError } = useQuery({
    queryKey: ['availableTemplates'],
    queryFn: () => settingsApi.getAvailableTemplates(),
  });

  // Debug logging
  console.log('=== TemplateSelector Debug ===');
  console.log('Templates response:', templates);
  console.log('Templates error:', templatesError);
  console.log('Current template response:', currentTemplate);
  console.log('Current template data:', currentTemplate?.data);
  console.log('Current template data.data:', currentTemplate?.data?.data);
  console.log('Current templateId (old):', currentTemplate?.data?.templateId);
  console.log('Current templateId (new):', currentTemplate?.data?.data?.templateId);
  console.log('Selected template state:', selectedTemplate);
  console.log('Is loading current:', isLoadingCurrent);
  console.log('Is loading templates:', isLoadingTemplates);
  console.log('================================');

  // Update template setting
  const updateTemplateMutation = useMutation({
    mutationFn: (templateId: string) => settingsApi.updateTemplateSettings(templateId),
    onSuccess: (data, templateId) => {
      console.log('Template update successful, templateId:', templateId);
      // Invalidate and refetch template settings to update the UI
      queryClient.invalidateQueries({ queryKey: ['templateSettings'] });
      // Reset selected template to show the new current template
      setSelectedTemplate('');
      toast.success('Шаблон успешно обновлен');
    },
    onError: (error: any) => {
      console.error('Template update error:', error);
      toast.error(error.response?.data?.message || 'Ошибка при обновлении шаблона');
    },
  });

  // Update selected template when current template changes
  useEffect(() => {
    const templateId = currentTemplate?.data?.data?.templateId;
    if (templateId && !selectedTemplate) {
      console.log('Setting selected template from current template:', templateId);
      setSelectedTemplate(templateId);
    }
  }, [currentTemplate, selectedTemplate]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
  };

  const handleSaveTemplate = () => {
    if (selectedTemplate) {
      updateTemplateMutation.mutate(selectedTemplate);
    }
  };

  const handlePreviewTemplate = (templateId: string) => {
    // Open preview in new tab
    window.open(`/pdf-test/generate-test-pdf?template=${templateId}`, '_blank');
  };

  if (isLoadingTemplates || isLoadingCurrent) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (templatesError) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          <p>Ошибка загрузки шаблонов: {templatesError.message}</p>
        </div>
      </Card>
    );
  }

  // Extract templates array safely - handle Axios response object
  const templatesList = templates?.data?.data || templates?.data || templates || [];
  
  if (!Array.isArray(templatesList)) {
    console.error('Templates data is not an array:', templatesList);
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          <p>Ошибка: данные шаблонов имеют неверный формат</p>
        </div>
      </Card>
    );
  }

  const currentTemplateId = currentTemplate?.data?.data?.templateId || 'standard';
  // Use selectedTemplate if it exists, otherwise use currentTemplateId
  const selectedTemplateId = selectedTemplate || currentTemplateId;
  
  console.log('Template selection logic:');
  console.log('- currentTemplateId:', currentTemplateId);
  console.log('- selectedTemplate:', selectedTemplate);
  console.log('- selectedTemplateId:', selectedTemplateId);
  console.log('- currentTemplate data:', currentTemplate?.data);
  console.log('- currentTemplate data.data:', currentTemplate?.data?.data);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Palette className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Выбор шаблона чека
        </h2>
      </div>

      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Выберите шаблон для генерации PDF чеков. Каждый шаблон имеет уникальный дизайн и стиль.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {templatesList.map((template: Template) => (
          <div
            key={template.id}
            className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all ${
              selectedTemplateId === template.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            onClick={() => handleTemplateSelect(template.id)}
          >
            {/* Template Preview */}
            <div className="flex items-center justify-center h-16 mb-3 bg-white dark:bg-gray-800 rounded border">
              <span className="text-2xl">{TEMPLATE_PREVIEWS[template.id] || '📄'}</span>
            </div>

            {/* Template Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {template.name}
                </h3>
                {selectedTemplateId === template.id && (
                  <Check className="h-4 w-4 text-blue-600" />
                )}
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300">
                {template.description}
              </p>

              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                  {CATEGORY_LABELS[template.category] || template.category}
                </span>
              </div>

              {/* Color Preview */}
              <div className="flex gap-1">
                <div
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: template.colors.primary }}
                  title="Основной цвет"
                ></div>
                <div
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: template.colors.secondary }}
                  title="Вторичный цвет"
                ></div>
                <div
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: template.colors.accent }}
                  title="Акцентный цвет"
                ></div>
              </div>

              {/* Features */}
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {template.features.slice(0, 2).join(' • ')}
                {template.features.length > 2 && '...'}
              </div>
            </div>

            {/* Preview Button */}
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                handlePreviewTemplate(template.id);
              }}
            >
              <Eye className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {selectedTemplateId !== currentTemplateId && (
            <span>Выбран новый шаблон: <strong>{templatesList.find(t => t.id === selectedTemplateId)?.name}</strong></span>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setSelectedTemplate(currentTemplateId)}
            disabled={selectedTemplateId === currentTemplateId}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSaveTemplate}
            disabled={selectedTemplateId === currentTemplateId || updateTemplateMutation.isPending}
            loading={updateTemplateMutation.isPending}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </Card>
  );
};
