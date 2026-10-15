import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Save, X, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { parseApiError } from "../../lib/api-errors";
import { SettingsLoadError } from "./SettingsLoadError";
import { settingsApi } from "../../lib/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SettingsSection } from "./SettingsSection";
import { useTranslation } from "../../hooks/useTranslation";

export const CompanyInfoCustomizer = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const [formData, setFormData] = useState({
    companyName: "",
    companyAddress: "",
    companyEmail: "",
    companyPhone: "",
    companyTaxId: "",
    companyIban: "",
    companySwift: "",
    companyWebsite: "",
    companyTagline: "",
  });

  const formRef = useRef<HTMLFormElement>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const response = await settingsApi.getCompanyInfo();
      return response.data.data;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: false,
  });

  useEffect(() => {
    if (data && !isEditing) {
      setFormData({
        companyName: data.companyName || "",
        companyAddress: data.companyAddress || "",
        companyEmail: data.companyEmail || "",
        companyPhone: data.companyPhone || "",
        companyTaxId: data.companyTaxId || "",
        companyIban: data.companyIban || "",
        companySwift: data.companySwift || "",
        companyWebsite: data.companyWebsite || "",
        companyTagline: data.companyTagline || "",
      });
    }
  }, [data, isEditing]);

  const updateCompanyInfoMutation = useMutation({
    mutationFn: (companyInfo: typeof formData) =>
      settingsApi.updateCompanyInfo(companyInfo),
    onSuccess: async (_response, submitted) => {
      queryClient.setQueryData(["companyInfo"], submitted);
      await queryClient.invalidateQueries({ queryKey: ["companyInfo"] });
      setIsEditing(false);
      toast.success(
        t(
          "settings.companyInfoUpdated",
          "Company information updated successfully",
        ),
      );
    },
    onError: (error: unknown) => {
      toast.error(parseApiError(error).message);
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (data && !error && isEditing && formRef.current?.reportValidity())
      updateCompanyInfoMutation.mutate(formData);
  };

  const handleCancel = () => {
    if (data) {
      setFormData({
        companyName: data.companyName || "",
        companyAddress: data.companyAddress || "",
        companyEmail: data.companyEmail || "",
        companyPhone: data.companyPhone || "",
        companyTaxId: data.companyTaxId || "",
        companyIban: data.companyIban || "",
        companySwift: data.companySwift || "",
        companyWebsite: data.companyWebsite || "",
        companyTagline: data.companyTagline || "",
      });
    }
    setIsEditing(false);
  };

  const isSaving = updateCompanyInfoMutation.isPending;

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <SettingsSection
        title={t("settings.companyInformation", "Company Information")}
        description={t(
          "settings.companyInformationDescription",
          "Manage your company details that appear on invoices and receipts",
        )}
        icon={<Building2 className="h-5 w-5" />}
        actions={
          !isEditing && !isLoading && !error && data ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              {t("common.edit", "Edit")}
            </Button>
          ) : undefined
        }
      >
        {error ? (
          <SettingsLoadError error={error} retry={refetch} />
        ) : isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-24 rounded bg-surface-alt animate-pulse" />
                  <div className="h-10 rounded-lg bg-surface-alt animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Branding Section */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-3">
                {t("settings.branding", "Branding")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={t("settings.companyName", "Company Name")}
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companyNamePlaceholder",
                    "e.g., Acme Inc.",
                  )}
                  disabled={!isEditing || isSaving}
                />
                <Input
                  label={t("settings.companyTagline", "Company Tagline")}
                  name="companyTagline"
                  value={formData.companyTagline}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companyTaglinePlaceholder",
                    "e.g., Quality since 1990",
                  )}
                  disabled={!isEditing || isSaving}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[var(--color-border-light)]" />

            {/* Contact Info Section */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-3">
                {t("settings.contactInfo", "Contact Information")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={t("settings.companyEmail", "Company Email")}
                  name="companyEmail"
                  type="email"
                  value={formData.companyEmail}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companyEmailPlaceholder",
                    "e.g., info@company.com",
                  )}
                  disabled={!isEditing || isSaving}
                />
                <Input
                  label={t("settings.companyPhone", "Company Phone")}
                  name="companyPhone"
                  value={formData.companyPhone}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companyPhonePlaceholder",
                    "e.g., +1 234 567 8900",
                  )}
                  disabled={!isEditing || isSaving}
                />
                <Input
                  label={t("settings.companyWebsite", "Company Website")}
                  name="companyWebsite"
                  value={formData.companyWebsite}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companyWebsitePlaceholder",
                    "e.g., www.company.com",
                  )}
                  disabled={!isEditing || isSaving}
                />
                <div className="md:col-span-1">
                  <Input
                    label={t("settings.companyAddress", "Company Address")}
                    name="companyAddress"
                    value={formData.companyAddress}
                    onChange={handleInputChange}
                    placeholder={t(
                      "settings.companyAddressPlaceholder",
                      "e.g., 123 Main St, City, Country",
                    )}
                    disabled={!isEditing || isSaving}
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[var(--color-border-light)]" />

            {/* Legal & Banking Section */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-3">
                {t("settings.legalBanking", "Legal & Banking")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={t("settings.companyTaxId", "Tax ID / VAT ID")}
                  name="companyTaxId"
                  value={formData.companyTaxId}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companyTaxIdPlaceholder",
                    "e.g., UA1234567890",
                  )}
                  disabled={!isEditing || isSaving}
                />
                <div>{/* spacer for alignment */}</div>
                <Input
                  label={t("settings.companyIban", "IBAN")}
                  name="companyIban"
                  value={formData.companyIban}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companyIbanPlaceholder",
                    "e.g., UA213996220000026007233566001",
                  )}
                  disabled={!isEditing || isSaving}
                />
                <Input
                  label={t("settings.companySwift", "SWIFT / BIC")}
                  name="companySwift"
                  value={formData.companySwift}
                  onChange={handleInputChange}
                  placeholder={t(
                    "settings.companySwiftPlaceholder",
                    "e.g., BANKUA2X",
                  )}
                  disabled={!isEditing || isSaving}
                />
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <>
                <div className="border-t border-[var(--color-border)]" />
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    {t("common.cancel", "Cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {isSaving
                      ? t("common.saving", "Saving...")
                      : t("common.save", "Save")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </SettingsSection>
    </form>
  );
};
