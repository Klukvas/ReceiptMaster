import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { recipientsApi, type Recipient } from "../../lib/api";
import { ErrorCode, parseApiError } from "../../lib/api-errors";
import { EMAIL_SHAPE, PHONE_SHAPE } from "../../lib/field-patterns";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useTranslation } from "../../hooks/useTranslation";

interface RecipientFormProps {
  recipient?: Recipient | null;
  onClose: () => void;
}

type FieldErrors = Partial<Record<"name" | "email" | "phone", string>>;

const FIELD_IDS = {
  name: "recipient-name",
  email: "recipient-email",
  phone: "recipient-phone",
} as const;

export const RecipientForm = ({ recipient, onClose }: RecipientFormProps) => {
  const { t } = useTranslation();
  const isSubmittingRef = useRef(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [errors, setErrors] = useState<FieldErrors>({});

  const queryClient = useQueryClient();

  const showErrors = (found: FieldErrors): boolean => {
    setErrors(found);
    const first = (Object.keys(FIELD_IDS) as (keyof typeof FIELD_IDS)[]).find(
      (field) => found[field],
    );
    if (first) document.getElementById(FIELD_IDS[first])?.focus();
    return !first;
  };

  const validate = (): FieldErrors => ({
    ...(!formData.name.trim() && {
      name: t("errors.requiredFieldMissing"),
    }),
    ...(formData.email.trim() &&
      !EMAIL_SHAPE.test(formData.email.trim()) && {
        email: t("errors.invalidEmail"),
      }),
    ...(formData.phone.trim() &&
      !PHONE_SHAPE.test(formData.phone.trim()) && {
        phone: t("errors.invalidPhone"),
      }),
  });

  const clearError = (field: keyof FieldErrors) =>
    setErrors((previous) => ({ ...previous, [field]: undefined }));

  useEffect(() => {
    if (recipient) {
      setFormData({
        name: recipient.name,
        email: recipient.email || "",
        phone: recipient.phone || "",
        address: recipient.address || "",
      });
    }
  }, [recipient]);

  const createMutation = useMutation({
    mutationFn: recipientsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      toast.success(t("recipients.recipientCreated"));
      onClose();
    },
    onError: (error: unknown) => {
      const { code, message } = parseApiError(error);
      if (code === ErrorCode.RECIPIENT_ALREADY_EXISTS) {
        showErrors({ email: message });
        return;
      }
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Recipient> }) =>
      recipientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      toast.success(t("recipients.recipientUpdated"));
      onClose();
    },
    onError: (error: unknown) => {
      const { code, message } = parseApiError(error);
      if (code === ErrorCode.RECIPIENT_ALREADY_EXISTS) {
        showErrors({ email: message });
        return;
      }
      toast.error(message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showErrors(validate())) return;

    const data = {
      ...formData,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
    };

    // A fast double click fires twice before the button re-renders as disabled.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      if (recipient) {
        await updateMutation.mutateAsync({ id: recipient.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
    } catch {
      // The mutation's onError already tells the user what went wrong.
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={
        recipient
          ? t("recipients.editRecipient")
          : t("recipients.createRecipient")
      }
      tabIndex={-1}
      className="fixed inset-0 backdrop-blur-sm bg-[var(--color-overlay)] flex items-center justify-center z-50 outline-none"
    >
      <Card className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content">
            {recipient
              ? t("recipients.editRecipient")
              : t("recipients.createRecipient")}
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            id={FIELD_IDS.name}
            label={t("recipients.name")}
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              clearError("name");
            }}
            required
            error={errors.name}
          />

          <Input
            id={FIELD_IDS.email}
            label={t("recipients.email")}
            type="email"
            value={formData.email}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              clearError("email");
            }}
            error={errors.email}
          />

          <Input
            id={FIELD_IDS.phone}
            label={t("recipients.phone")}
            type="tel"
            value={formData.phone}
            onChange={(e) => {
              setFormData({ ...formData, phone: e.target.value });
              clearError("phone");
            }}
            error={errors.phone}
          />

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {t("recipients.address")}
            </label>
            <textarea
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent transition-colors duration-200 min-h-[80px] resize-none"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading
                ? t("recipients.saving")
                : recipient
                  ? t("recipients.update")
                  : t("common.create")}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
