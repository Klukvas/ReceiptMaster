import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Upload, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi } from '../lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';

export const LogoUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current logo
  const { data: currentLogo, refetch: refetchLogo, isSuccess: hasLogo } = useQuery({
    queryKey: ['logo'],
    queryFn: () => settingsApi.getLogo(),
    enabled: true, // Auto-fetch logo
    retry: false, // Don't retry on 404
  });

  // Get current company name
  const { data: companyNameData } = useQuery({
    queryKey: ['companyName'],
    queryFn: () => settingsApi.getCompanyName(),
  });

  // Update company name in input when data is loaded
  useEffect(() => {
    if (companyNameData?.data?.companyName !== undefined) {
      setCompanyName(companyNameData.data.companyName);
    }
  }, [companyNameData]);

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

  const updateCompanyNameMutation = useMutation({
    mutationFn: settingsApi.updateCompanyName,
    onSuccess: () => {
      toast.success('Название компании успешно обновлено!');
    },
    onError: () => {
      toast.error('Ошибка при обновлении названия компании');
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: settingsApi.deleteLogo,
    onSuccess: () => {
      refetchLogo();
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

  const handleLoadCurrentLogo = () => {
    refetchLogo();
  };

  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
  };

  const handleSaveCompanyName = () => {
    updateCompanyNameMutation.mutate(companyName.trim());
  };

  const handleDeleteLogo = () => {
    if (confirm('Вы уверены, что хотите удалить логотип?')) {
      deleteLogoMutation.mutate();
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Настройки компании
          </h3>
          <p className="text-sm text-gray-600">
            Настройте название компании и логотип для отображения в PDF чеках.
          </p>
        </div>

        {/* Company Name */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Название компании
          </label>
          <div className="flex space-x-2">
            <Input
              value={companyName}
              onChange={(e) => handleCompanyNameChange(e.target.value)}
              placeholder="Введите название компании"
              className="flex-1"
            />
            <Button
              onClick={handleSaveCompanyName}
              disabled={updateCompanyNameMutation.isPending}
              size="sm"
            >
              {updateCompanyNameMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>

        {/* Logo Upload Section */}
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-2">
            Логотип компании
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            Загрузите логотип для отображения в PDF чеках. Поддерживаются форматы: JPG, PNG, GIF, SVG. Максимальный размер: 5MB.
          </p>
        </div>

        {/* Current Logo Display */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
          <div className="text-center">
            {hasLogo ? (
              <div className="space-y-3">
                <img
                  src={`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'}/settings/logo`}
                  alt="Current logo"
                  className="mx-auto h-24 w-24 object-contain border border-gray-200 rounded"
                />
                <p className="text-sm text-gray-600">
                  Текущий логотип
                </p>
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
            ) : (
              <div>
                <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  Логотип не загружен
                </p>
              </div>
            )}
          </div>
        </div>

        {/* File Upload */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
          <div className="text-center">
            {previewUrl ? (
              <div className="space-y-4">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="mx-auto h-24 w-24 object-contain border border-gray-200 rounded"
                />
                <p className="text-sm text-gray-600">
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
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
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

      </div>
    </Card>
  );
};
