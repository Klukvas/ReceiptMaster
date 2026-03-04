import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Trash2, ImageIcon } from "lucide-react";
import toast from "react-hot-toast";
import { settingsApi } from "../../lib/api";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
import { SettingsSection } from "./SettingsSection";
import { useTranslation } from "../../hooks/useTranslation";

export const LogoUpload = () => {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const {
    refetch: refetchLogo,
    isSuccess: hasLogo,
    error: logoError,
    data: logoData,
    isLoading: logoLoading,
  } = useQuery({
    queryKey: ["logo"],
    queryFn: () => settingsApi.getLogo(),
    enabled: true,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const isDeleted = logoError && (logoError as any)?.response?.status === 404;

    if (logoData && hasLogo && !logoError && !isDeleted) {
      const url = URL.createObjectURL(logoData.data);
      setLogoUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      if (logoUrl) {
        URL.revokeObjectURL(logoUrl);
      }
      setLogoUrl(null);
    }
  }, [logoData, hasLogo, logoError]);

  const uploadMutation = useMutation({
    mutationFn: settingsApi.uploadLogo,
    onSuccess: () => {
      setSelectedFile(null);
      setPreviewUrl(null);
      refetchLogo();
      toast.success(t("settings.logoUploaded", "Logo uploaded successfully"));
    },
    onError: () => {
      toast.error(t("settings.failedToUploadLogo", "Failed to upload logo"));
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: settingsApi.deleteLogo,
    onSuccess: async () => {
      if (logoUrl) {
        URL.revokeObjectURL(logoUrl);
      }
      setLogoUrl(null);
      queryClient.removeQueries({ queryKey: ["logo"] });
      queryClient.cancelQueries({ queryKey: ["logo"] });
      await queryClient.refetchQueries({ queryKey: ["logo"] });
      toast.success(t("settings.logoDeleted", "Logo deleted successfully"));
    },
    onError: () => {
      toast.error(t("settings.failedToDeleteLogo", "Failed to delete logo"));
    },
  });

  const validateAndSetFile = useCallback(
    (file: File) => {
      if (!file.type.match(/^image\/(jpg|jpeg|png|gif|svg\+xml)$/)) {
        toast.error(
          t(
            "settings.logoInvalidType",
            "Please select an image file (JPG, PNG, GIF, SVG)",
          ),
        );
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(
          t("settings.logoTooLarge", "File size must not exceed 5MB"),
        );
        return;
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    },
    [t],
  );

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = () => {
    if (selectedFile) uploadMutation.mutate(selectedFile);
  };

  const handleRemove = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteLogo = () => {
    setShowDeleteConfirm(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasCurrentLogo = !logoLoading && logoUrl && hasLogo && !logoError;

  return (
    <>
      <SettingsSection
        title={t("settings.logoTitle", "Company Logo")}
        description={t(
          "settings.logoDescription",
          "Upload your company logo to display on PDF receipts and documents.",
        )}
        icon={<ImageIcon className="h-5 w-5" />}
      >
        {/* Current Logo Display */}
        {(logoLoading || hasCurrentLogo) && (
          <div className="flex items-center gap-5 rounded-lg border border-[var(--color-border)] bg-surface-alt p-4">
            {logoLoading ? (
              <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-surface-alt" />
            ) : (
              <div className="relative shrink-0">
                <img
                  key={logoUrl || "no-logo"}
                  src={logoUrl || undefined}
                  alt="Company logo"
                  className="h-20 w-20 rounded-lg border border-[var(--color-border)] object-contain bg-elevated shadow-sm"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-success-base border-2 border-elevated" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-content">
                {t("settings.logoActive", "Logo active")}
              </p>
              <p className="text-xs text-content-tertiary mt-0.5">
                {t(
                  "settings.logoInDocuments",
                  "Displayed on all PDF receipts and documents",
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteLogo}
              disabled={deleteLogoMutation.isPending}
              className="shrink-0 text-danger-base border-[var(--color-danger-light)] hover:bg-[var(--color-danger-light)]"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {deleteLogoMutation.isPending
                ? t("common.deleting", "Deleting...")
                : t("settings.deleteLogo", "Delete")}
            </Button>
          </div>
        )}

        {/* Upload Area */}
        {!logoLoading && !hasCurrentLogo && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative rounded-lg border-2 border-dashed transition-all duration-200 ${
              isDragging
                ? "border-accent-base bg-[var(--color-accent-light)]"
                : previewUrl
                  ? "border-[var(--color-border)] bg-surface-alt"
                  : "border-[var(--color-border)] hover:border-[var(--color-border)] bg-surface-alt"
            }`}
          >
            {previewUrl && selectedFile ? (
              <div className="flex items-center gap-4 p-4">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-16 w-16 rounded-lg border border-[var(--color-border)] object-contain bg-elevated"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-content-tertiary mt-0.5">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={handleUpload}
                    disabled={uploadMutation.isPending}
                  >
                    {uploadMutation.isPending
                      ? t("settings.uploading", "Uploading...")
                      : t("settings.uploadLogo", "Upload")}
                  </Button>
                  <button
                    onClick={handleRemove}
                    className="p-1.5 rounded-md text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center py-8 px-4 cursor-pointer"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                    isDragging
                      ? "bg-[var(--color-accent-light)] text-accent-base"
                      : "bg-surface-alt text-content-tertiary"
                  }`}
                >
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-content-secondary">
                  {t(
                    "settings.dragDropOrClick",
                    "Drag & drop or click to upload",
                  )}
                </p>
                <p className="mt-1 text-xs text-content-tertiary">
                  {t(
                    "settings.supportedFormats",
                    "JPG, PNG, GIF, SVG up to 5MB",
                  )}
                </p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}
      </SettingsSection>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteLogoMutation.mutate();
          setShowDeleteConfirm(false);
        }}
        title={t("settings.deleteLogo", "Delete Logo")}
        message={t(
          "settings.confirmDeleteLogo",
          "Are you sure you want to delete the logo?",
        )}
        isLoading={deleteLogoMutation.isPending}
      />
    </>
  );
};
