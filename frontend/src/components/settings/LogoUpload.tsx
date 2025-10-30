import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
// import { Input } from '../ui/Input';

export const LogoUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // const [companyName, setCompanyName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Get current logo
  const { refetch: refetchLogo, isSuccess: hasLogo, error: logoError, data: logoData, isLoading: logoLoading } = useQuery({
    queryKey: ['logo'],
    queryFn: () => settingsApi.getLogo(),
    enabled: true, // Auto-fetch logo
    retry: false, // Don't retry on 404
  });

  // Create blob URL for logo display
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (logoData && hasLogo && !logoError) {
      // Create blob URL from the data
      // logoData.data is the Blob when responseType is 'blob'
      const url = URL.createObjectURL(logoData.data);
      setLogoUrl(url);
      
      // Cleanup function to revoke the URL when component unmounts or logo changes
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      // Clear logo URL if there's no data or there's an error (including 404)
      if (logoUrl) {
        URL.revokeObjectURL(logoUrl);
      }
      setLogoUrl(null);
    }
  }, [logoData, hasLogo, logoError]);

  // Company name UI removed

  const uploadMutation = useMutation({
    mutationFn: settingsApi.uploadLogo,
    onSuccess: () => {
      setSelectedFile(null);
      setPreviewUrl(null);
      refetchLogo();
      toast.success('Логотип успешно загружен!');
    },
    onError: () => {
      toast.error('Ошибка при загрузке логотипа');
    },
  });

  // Removed company name mutation

  const deleteLogoMutation = useMutation({
    mutationFn: settingsApi.deleteLogo,
    onSuccess: async () => {
      // Clear logo URL immediately
      if (logoUrl) {
        URL.revokeObjectURL(logoUrl);
      }
      setLogoUrl(null);
      // Reset query cache to remove the old logo data
      queryClient.removeQueries({ queryKey: ['logo'] });
      // Refetch to verify deletion (will return 404, which is expected)
      await refetchLogo();
      toast.success('Логотип успешно удален!');
    },
    onError: () => {
      toast.error('Ошибка при удалении логотипа');
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.match(/^image\/(jpg|jpeg|png|gif|svg)$/)) {
        alert('Пожалуйста, выберите файл изображения (JPG, PNG, GIF, SVG)');
        return;
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5MB');
        return;
      }

      setSelectedFile(file);
      
      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  // Removed company name handlers

  const handleDeleteLogo = () => {
    if (confirm('Вы уверены, что хотите удалить логотип?')) {
      deleteLogoMutation.mutate();
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Настройки компании
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Настройте название компании и логотип для отображения в PDF чеках.
          </p>
        </div>

        

        {/* Logo Upload Section */}
        <div>
          <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">
            Логотип компании
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Загрузите логотип для отображения в PDF чеках. Поддерживаются форматы: JPG, PNG, GIF, SVG. Максимальный размер: 5MB.
          </p>
        </div>

        {/* Current Logo Display */}
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
          <div className="text-center">
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">
              Текущий логотип
            </h4>
            {logoLoading ? (
              <div className="space-y-4">
                <div className="mx-auto h-32 w-32 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                  <div className="text-gray-400 dark:text-gray-500 text-sm">Загрузка...</div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Загрузка логотипа...
                </p>
              </div>
            ) : logoUrl && hasLogo && !logoError ? (
              <div className="space-y-4">
                <div className="relative inline-block">
                  <img
                    src={logoUrl}
                    alt="Current logo"
                    className="mx-auto h-32 w-32 object-contain border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm"
                    onError={(e) => {
                      console.error('Failed to load logo image');
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                    Активен
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    ✓ Логотип загружен и используется в документах
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Логотип отображается в PDF чеках и других документах
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDeleteLogo}
                  disabled={deleteLogoMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deleteLogoMutation.isPending ? 'Удаление...' : 'Удалить логотип'}
                </Button>
              </div>
            ) : logoError && (logoError as any)?.response?.status !== 404 ? (
              <div className="space-y-4">
                <div className="relative inline-block">
                  <ImageIcon className="mx-auto h-16 w-16 text-red-400 dark:text-red-500" />
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    Ошибка
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Ошибка загрузки логотипа
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(logoError as any)?.message || 'Не удалось загрузить логотип'}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => refetchLogo()}
                  >
                    Попробовать снова
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative inline-block">
                  <ImageIcon className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-500" />
                  <div className="absolute -top-2 -right-2 bg-gray-400 text-white text-xs px-2 py-1 rounded-full">
                    Не установлен
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Логотип не загружен
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Загрузите логотип для отображения в документах
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* File Upload: show only when no current logo */}
        {!(logoUrl && hasLogo && !logoError) && (
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
            <div className="text-center">
              {previewUrl ? (
                <div className="space-y-4">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="mx-auto h-24 w-24 object-contain border border-gray-200 dark:border-gray-600 rounded"
                  />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {selectedFile?.name}
                  </p>
                  <div className="flex justify-center space-x-2">
                    <Button
                      onClick={handleUpload}
                      disabled={uploadMutation.isPending}
                      size="sm"
                    >
                      {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleRemove}
                      size="sm"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    Выберите файл логотипа
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2"
                  >
                    Выбрать файл
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </Card>
  );
};
