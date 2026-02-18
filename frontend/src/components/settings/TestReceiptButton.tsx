import { useState } from 'react';
import { FileText, Loader2, Download, Eye } from 'lucide-react';
import { receiptsApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { SettingsSection } from './SettingsSection';
import { useTranslation } from '../../hooks/useTranslation';

export const TestReceiptButton = () => {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTestPreview = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await receiptsApi.testPreview();
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      setError(t('settings.testReceiptError', 'Failed to generate test receipt'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTestDownload = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await receiptsApi.testPreview();
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'test-receipt.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('settings.testReceiptError', 'Failed to generate test receipt'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SettingsSection
      title={t('settings.previewReceiptTitle', 'Preview Receipt')}
      description={t('settings.testReceiptDesc', 'Generate a sample receipt using your current settings to preview how it will look.')}
      icon={<Eye className="h-5 w-5" />}
    >
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <Button
          onClick={handleTestPreview}
          disabled={isGenerating}
          size="sm"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          {t('settings.previewReceipt', 'Preview PDF')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestDownload}
          disabled={isGenerating}
        >
          <Download className="h-4 w-4 mr-2" />
          {t('settings.downloadTest', 'Download Sample')}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>
      )}
    </SettingsSection>
  );
};
