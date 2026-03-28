import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft, FileQuestion } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useTranslation } from "../hooks/useTranslation";
import { SEO } from "../components/seo/SEO";

export const NotFoundPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleGoHome = () => {
    navigate("/");
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-surface-alt flex items-center justify-center px-4">
      <SEO title="Page Not Found" noindex />
      <div className="max-w-md w-full">
        <Card className="p-8 text-center">
          {/* 404 Icon */}
          <div className="mb-6">
            <div className="mx-auto w-24 h-24 bg-surface-alt rounded-full flex items-center justify-center ring-4 ring-[var(--color-border)]">
              <FileQuestion
                className="w-12 h-12 text-content-tertiary"
                aria-hidden
              />
            </div>
          </div>

          {/* Error Code */}
          <h1 className="text-6xl font-bold text-content mb-4">404</h1>

          {/* Error Message */}
          <h2 className="text-2xl font-semibold text-content mb-4">
            {t("notFound.title")}
          </h2>

          <p className="text-content-secondary mb-8">
            {t("notFound.description")}
          </p>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button onClick={handleGoHome} className="w-full" size="lg">
              <Home className="w-4 h-4 mr-2" />
              {t("notFound.goHome")}
            </Button>

            <Button
              variant="outline"
              onClick={handleGoBack}
              className="w-full"
              size="lg"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("notFound.goBack")}
            </Button>
          </div>

          {/* Additional Help */}
          <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
            <p className="text-sm text-content-tertiary">
              {t("notFound.helpText")}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
