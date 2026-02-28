import { useState } from 'react';
import { Building2, Palette, Package, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { settingsApi, productsApi, recipientsApi, amountToCents } from '../../lib/api';
import { CompanyInfoStep, type CompanyData } from './steps/CompanyInfoStep';
import { TemplateStep, type TemplateData } from './steps/TemplateStep';
import { FirstProductStep, type ProductData } from './steps/FirstProductStep';
import { FirstRecipientStep, type RecipientData } from './steps/FirstRecipientStep';

const TOTAL_STEPS = 4;

const STEP_ICONS = [Building2, Palette, Package, Users];

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

export const OnboardingModal = ({ open, onComplete }: OnboardingModalProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [companyData, setCompanyData] = useState<CompanyData>({
    companyName: '',
    companyEmail: '',
    companyPhone: '',
    companyAddress: '',
  });

  const [templateData, setTemplateData] = useState<TemplateData>({
    templateId: 'standard',
    templateLanguage: 'en',
  });

  const [productData, setProductData] = useState<ProductData>({
    name: '',
    purchase_price: '',
    sale_price: '',
    quantity: '',
  });

  const [recipientData, setRecipientData] = useState<RecipientData>({
    name: '',
    email: '',
    phone: '',
  });

  const stepTitleKeys = [
    'onboarding.step1',
    'onboarding.step2',
    'onboarding.step3',
    'onboarding.step4',
  ] as const;

  const handleSkip = async () => {
    try {
      await settingsApi.completeOnboarding();
    } catch {
      // silently ignore — user can still proceed
    }
    onComplete();
  };

  const saveCurrentStep = async (): Promise<boolean> => {
    try {
      setSaving(true);

      if (currentStep === 0 && companyData.companyName.trim()) {
        await settingsApi.updateCompanyInfo({
          companyName: companyData.companyName,
          companyEmail: companyData.companyEmail,
          companyPhone: companyData.companyPhone,
          companyAddress: companyData.companyAddress,
        });
      }

      if (currentStep === 1) {
        await settingsApi.updateTemplateSettings(templateData.templateId);
        await settingsApi.updateTemplateLanguage(templateData.templateLanguage);
      }

      if (currentStep === 2 && productData.name.trim()) {
        await productsApi.create({
          name: productData.name,
          purchase_price_cents: amountToCents(productData.purchase_price),
          sale_price_cents: amountToCents(productData.sale_price),
          quantity: parseInt(productData.quantity, 10) || 0,
          currency: 'UAH',
        });
      }

      if (currentStep === 3 && recipientData.name.trim()) {
        await recipientsApi.create({
          name: recipientData.name,
          email: recipientData.email || undefined,
          phone: recipientData.phone || undefined,
        });
      }

      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t('common.error');
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await saveCurrentStep();
    if (!ok) return;

    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Last step — finish
      try {
        await settingsApi.completeOnboarding();
      } catch {
        // non-blocking
      }
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const isLastStep = currentStep === TOTAL_STEPS - 1;

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <CompanyInfoStep data={companyData} onChange={setCompanyData} />;
      case 1:
        return <TemplateStep data={templateData} onChange={setTemplateData} />;
      case 2:
        return <FirstProductStep data={productData} onChange={setProductData} />;
      case 3:
        return <FirstRecipientStep data={recipientData} onChange={setRecipientData} />;
      default:
        return null;
    }
  };

  const stepTitle = t(`${stepTitleKeys[currentStep]}.title`);
  const stepSubtitle = t(`${stepTitleKeys[currentStep]}.subtitle`);

  return (
    <Modal isOpen={open} onClose={handleSkip} size="lg" showCloseButton={true}>
      {/* Step indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {stepTitle}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {stepSubtitle}
            </p>
          </div>
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            {t('onboarding.stepOf', { current: currentStep + 1, total: TOTAL_STEPS })}
          </span>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
            const Icon = STEP_ICONS[i];
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;

            return (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : isCompleted
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[280px]">
        {renderStep()}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {t('onboarding.skip')}
        </button>

        <div className="flex gap-2">
          {currentStep > 0 && (
            <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>
              {t('onboarding.back')}
            </Button>
          )}
          <Button size="sm" onClick={handleNext} disabled={saving}>
            {saving
              ? t('common.saving')
              : isLastStep
                ? t('onboarding.finish')
                : t('onboarding.next')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
