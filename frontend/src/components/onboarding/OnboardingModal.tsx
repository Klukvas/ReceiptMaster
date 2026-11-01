import { useRef, useState } from "react";
import { Building2, Palette, Package, Users } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useTranslation } from "../../hooks/useTranslation";
import {
  settingsApi,
  productsApi,
  recipientsApi,
  type Product,
  type Recipient,
  type UpdateProductRequest,
} from "../../lib/api";
import { ErrorCode, parseApiError } from "../../lib/api-errors";
import { CompanyInfoStep, type CompanyData } from "./steps/CompanyInfoStep";
import { TemplateStep, type TemplateData } from "./steps/TemplateStep";
import { FirstProductStep, type ProductData } from "./steps/FirstProductStep";
import {
  FirstRecipientStep,
  type RecipientData,
} from "./steps/FirstRecipientStep";
import {
  EMPTY_STEP,
  hasChanges,
  isBlank,
  isUnconfirmedFailure,
  productCreateBody,
  productUpdate,
  recipientCreateBody,
  recipientUpdate,
  saveEntityStep,
  type EntityStep,
  type ProductCreateBody,
  type RecipientCreateBody,
  type StepStore,
} from "./onboarding-entities";

const TOTAL_STEPS = 4;

const STEP_ICONS = [Building2, Palette, Package, Users];

const STEP_TITLE_KEYS = [
  "onboarding.step1",
  "onboarding.step2",
  "onboarding.step3",
  "onboarding.step4",
] as const;

type Entities = {
  readonly product: EntityStep<Product, ProductCreateBody>;
  readonly recipient: EntityStep<Recipient, RecipientCreateBody>;
};

type Notice =
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "unconfirmed" }
  | { readonly kind: "finishFailed" };

/** Stock moved since the step saved the product; nothing in the PATCH applied. */
class StockConflict extends Error {
  readonly server: number;
  readonly mine: number;

  constructor(server: number, mine: number) {
    super("Product stock changed since it was saved");
    this.server = server;
    this.mine = mine;
  }
}

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

export const OnboardingModal = ({ open, onComplete }: OnboardingModalProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Closed after a failed skip without completing; offered again on the next visit.
  const [isDismissed, setIsDismissed] = useState(false);
  // Single flight: every action that talks to the server, and closing, waits for it.
  const inFlight = useRef(false);
  // A ref, not state: a click right after a save must see the saved id.
  const entities = useRef<Entities>({
    product: EMPTY_STEP,
    recipient: EMPTY_STEP,
  });

  const [companyData, setCompanyData] = useState<CompanyData>({
    companyName: "",
    companyEmail: "",
    companyPhone: "",
    companyAddress: "",
  });

  const [templateData, setTemplateData] = useState<TemplateData>({
    templateId: "standard",
    templateLanguage: "en",
  });

  const [productData, setProductData] = useState<ProductData>({
    name: "",
    purchase_price: "",
    sale_price: "",
    quantity: "",
  });

  const [recipientData, setRecipientData] = useState<RecipientData>({
    name: "",
    email: "",
    phone: "",
  });

  const productStore: StepStore<Product, ProductCreateBody> = {
    get: () => entities.current.product,
    set: (product) => {
      entities.current = { ...entities.current, product };
    },
  };

  const recipientStore: StepStore<Recipient, RecipientCreateBody> = {
    get: () => entities.current.recipient,
    set: (recipient) => {
      entities.current = { ...entities.current, recipient };
    },
  };

  const runExclusive = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const sendProductUpdate = async (
    id: string,
    update: UpdateProductRequest,
  ): Promise<Product> => {
    try {
      return (await productsApi.update(id, update)).data;
    } catch (error) {
      if (parseApiError(error).code !== ErrorCode.PRODUCT_QUANTITY_CONFLICT) {
        throw error;
      }
      // The server's stock becomes the baseline; saving again overwrites it knowingly.
      const { data: fresh } = await productsApi.getById(id);
      productStore.set({ ...productStore.get(), saved: fresh });
      if (!hasChanges(productUpdate(fresh, productData))) return fresh;
      throw new StockConflict(
        fresh.quantity,
        update.quantity ?? fresh.quantity,
      );
    }
  };

  const saveStep = async (step: number): Promise<void> => {
    if (step === 0 && companyData.companyName.trim()) {
      await settingsApi.updateCompanyInfo({
        companyName: companyData.companyName,
        companyEmail: companyData.companyEmail,
        companyPhone: companyData.companyPhone,
        companyAddress: companyData.companyAddress,
      });
    }

    if (step === 1) {
      await settingsApi.updateTemplateSettings(templateData.templateId);
      await settingsApi.updateTemplateLanguage(templateData.templateLanguage);
    }

    if (step === 2) {
      await saveEntityStep(productStore, {
        isSkipped: isBlank(productData.name),
        body: () => productCreateBody(productData),
        update: (saved) => productUpdate(saved, productData),
        sendCreate: async ({ body, key }) =>
          (await productsApi.create(body, { idempotencyKey: key })).data,
        sendUpdate: sendProductUpdate,
      });
    }

    if (step === 3) {
      await saveEntityStep(recipientStore, {
        isSkipped: isBlank(recipientData.name),
        body: () => recipientCreateBody(recipientData),
        update: (saved) => recipientUpdate(saved, recipientData),
        sendCreate: async ({ body, key }) =>
          (await recipientsApi.create(body, { idempotencyKey: key })).data,
        sendUpdate: async (id, update) =>
          (await recipientsApi.update(id, update)).data,
      });
    }
  };

  const noticeFor = (error: unknown): Notice => {
    if (error instanceof StockConflict) {
      return {
        kind: "error",
        message: t("products.quantityConflict", {
          server: error.server,
          mine: error.mine,
        }),
      };
    }
    if (isUnconfirmedFailure(error)) return { kind: "unconfirmed" };
    return { kind: "error", message: parseApiError(error).message };
  };

  const handleNext = () =>
    runExclusive(async () => {
      setNotice(null);
      try {
        await saveStep(currentStep);
      } catch (error) {
        // The step and every typed value stay; only the notice changes.
        setNotice(noticeFor(error));
        return;
      }

      if (currentStep < TOTAL_STEPS - 1) {
        setCurrentStep(currentStep + 1);
        return;
      }

      try {
        await settingsApi.completeOnboarding();
      } catch (error) {
        console.warn("Completing onboarding failed", error);
        setNotice({ kind: "finishFailed" });
        return;
      }
      onComplete();
    });

  const handleBack = () => {
    if (inFlight.current || currentStep === 0) return;
    setNotice(null);
    setCurrentStep(currentStep - 1);
  };

  const handleSkip = () =>
    runExclusive(async () => {
      try {
        await settingsApi.completeOnboarding();
      } catch (error) {
        console.warn("Skipping onboarding failed", error);
        setIsDismissed(true);
        toast.error(t("onboarding.skipFailed"));
        return;
      }
      onComplete();
    });

  const isLastStep = currentStep === TOTAL_STEPS - 1;

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <CompanyInfoStep data={companyData} onChange={setCompanyData} />;
      case 1:
        return <TemplateStep data={templateData} onChange={setTemplateData} />;
      case 2:
        return (
          <FirstProductStep data={productData} onChange={setProductData} />
        );
      case 3:
        return (
          <FirstRecipientStep
            data={recipientData}
            onChange={setRecipientData}
          />
        );
      default:
        return null;
    }
  };

  const noticeText = (current: Notice) => {
    switch (current.kind) {
      case "error":
        return current.message;
      case "unconfirmed":
        return t("onboarding.saveUnconfirmed");
      case "finishFailed":
        return t("onboarding.finishFailed");
    }
  };

  const stepTitle = t(`${STEP_TITLE_KEYS[currentStep]}.title`);
  const stepSubtitle = t(`${STEP_TITLE_KEYS[currentStep]}.subtitle`);

  return (
    <Modal
      isOpen={open && !isDismissed}
      onClose={handleSkip}
      size="lg"
      showCloseButton={true}
    >
      {/* Step indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-content">{stepTitle}</h2>
            <p className="text-sm text-content-tertiary mt-1">{stepSubtitle}</p>
          </div>
          <span className="text-xs font-medium text-content-tertiary">
            {t("onboarding.stepOf", {
              current: currentStep + 1,
              total: TOTAL_STEPS,
            })}
          </span>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-2">
          {STEP_ICONS.map((Icon, i) => {
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;

            return (
              <div
                key={STEP_TITLE_KEYS[i]}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--color-accent-light)] text-accent-base"
                    : isCompleted
                      ? "bg-[var(--color-success-light)] text-success-base"
                      : "bg-surface-alt text-content-tertiary"
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
      <div className="min-h-[280px]">{renderStep()}</div>

      {notice && (
        <div
          role="alert"
          data-testid="onboarding-notice"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-[var(--color-danger-light)] p-3 text-sm text-danger-base"
        >
          <span>{noticeText(notice)}</span>
          {notice.kind !== "error" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={saving}
            >
              {t("common.retry")}
            </Button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="text-sm text-content-tertiary hover:text-content-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("onboarding.skip")}
        </button>

        <div className="flex gap-2">
          {currentStep > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={saving}
            >
              {t("onboarding.back")}
            </Button>
          )}
          <Button size="sm" onClick={handleNext} disabled={saving}>
            {saving
              ? t("common.saving")
              : isLastStep
                ? t("onboarding.finish")
                : t("onboarding.next")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
