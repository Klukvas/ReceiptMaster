import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useTranslation } from '../hooks/useTranslation';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleGoHome = () => {
    navigate('/');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <Card className="p-8 text-center">
          {/* 404 Icon */}
          <div className="mb-6">
            <div className="mx-auto w-24 h-24 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <Search className="w-12 h-12 text-red-600 dark:text-red-400" />
            </div>
          </div>

          {/* Error Code */}
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">
            404
          </h1>

          {/* Error Message */}
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('notFound.title')}
          </h2>

          <p className="text-gray-600 dark:text-gray-300 mb-8">
            {t('notFound.description')}
          </p>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleGoHome}
              className="w-full"
              size="lg"
            >
              <Home className="w-4 h-4 mr-2" />
              {t('notFound.goHome')}
            </Button>

            <Button
              variant="outline"
              onClick={handleGoBack}
              className="w-full"
              size="lg"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('notFound.goBack')}
            </Button>
          </div>

          {/* Additional Help */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('notFound.helpText')}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
