import React, { useState, useEffect } from"react";
import { useMutation, useQueryClient } from"@tanstack/react-query";
import { FileText, Save, X, Pencil } from"lucide-react";
import toast from"react-hot-toast";
import { settingsApi } from"../../lib/api";
import { Button } from"../ui/Button";
import { Input } from"../ui/Input";
import { SettingsSection } from"./SettingsSection";
import { useTranslation } from"../../hooks/useTranslation";
import {
 useReceiptDesignSettings,
 RECEIPT_DESIGN_QUERY_KEY,
} from"../../hooks/useReceiptDesignSettings";

export const FooterCustomizer = () => {
 const { t } = useTranslation();
 const queryClient = useQueryClient();
 const [isEditing, setIsEditing] = useState(false);

 const [formData, setFormData] = useState({
 footerTitle:"",
 footerSubtitle:"",
 });

 const { data: designData, isLoading } = useReceiptDesignSettings();

 useEffect(() => {
 if (designData) {
 setFormData({
 footerTitle: designData.footerTitle ||"",
 footerSubtitle: designData.footerSubtitle ||"",
 });
 }
 }, [designData]);

 const updateFooterTitleMutation = useMutation({
 mutationFn: (footerTitle: string) =>
 settingsApi.updateFooterTitle(footerTitle),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [...RECEIPT_DESIGN_QUERY_KEY] });
 toast.success(
 t(
"settings.footerTitleUpdated",
"Footer title updated successfully",
 ),
 );
 },
 onError: (error: any) => {
 toast.error(
 error.response?.data?.message ||
 t(
"settings.footerTitleUpdateFailed",
"Failed to update footer title",
 ),
 );
 },
 });

 const updateFooterSubtitleMutation = useMutation({
 mutationFn: (footerSubtitle: string) =>
 settingsApi.updateFooterSubtitle(footerSubtitle),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [...RECEIPT_DESIGN_QUERY_KEY] });
 toast.success(
 t(
"settings.footerSubtitleUpdated",
"Footer subtitle updated successfully",
 ),
 );
 },
 onError: (error: any) => {
 toast.error(
 error.response?.data?.message ||
 t(
"settings.footerSubtitleUpdateFailed",
"Failed to update footer subtitle",
 ),
 );
 },
 });

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const { name, value } = e.target;
 setFormData((prev) => ({ ...prev, [name]: value }));
 };

 const handleSave = () => {
 updateFooterTitleMutation.mutate(formData.footerTitle);
 updateFooterSubtitleMutation.mutate(formData.footerSubtitle);
 setIsEditing(false);
 };

 const handleCancel = () => {
 setFormData({
 footerTitle: designData?.footerTitle ||"",
 footerSubtitle: designData?.footerSubtitle ||"",
 });
 setIsEditing(false);
 };

 const isSaving =
 updateFooterTitleMutation.isPending ||
 updateFooterSubtitleMutation.isPending;

 return (
 <SettingsSection
 title={t("settings.footerCustomization","Footer Customization")}
 description={t(
"settings.footerCustomizationDescription",
"Customize the footer title and subtitle that appear on your invoices and receipts",
 )}
 icon={<FileText className="h-5 w-5" />}
 actions={
 !isEditing && !isLoading ? (
 <Button
 variant="outline"
 size="sm"
 onClick={() => setIsEditing(true)}
 >
 <Pencil className="h-3.5 w-3.5 mr-1.5" />
 {t("common.edit","Edit")}
 </Button>
 ) : undefined
 }
 >
 {isLoading ? (
 <div className="space-y-4">
 {[...Array(2)].map((_, i) => (
 <div key={i} className="space-y-2">
 <div className="h-4 w-24 rounded bg-surface-alt animate-pulse" />
 <div className="h-10 rounded-lg bg-surface-alt animate-pulse" />
 </div>
 ))}
 </div>
 ) : (
 <div className="space-y-4">
 <div>
 <Input
 label={t("settings.footerTitle","Footer Title")}
 name="footerTitle"
 value={formData.footerTitle}
 onChange={handleInputChange}
 placeholder={t(
"settings.footerTitlePlaceholder",
"e.g., Thank you for your purchase!",
 )}
 disabled={!isEditing}
 />
 <p className="text-xs text-content-tertiary mt-1.5">
 {t(
"settings.footerTitleHint",
"This text will appear as the main footer title on your receipts",
 )}
 </p>
 </div>

 <div>
 <Input
 label={t("settings.footerSubtitle","Footer Subtitle")}
 name="footerSubtitle"
 value={formData.footerSubtitle}
 onChange={handleInputChange}
 placeholder={t(
"settings.footerSubtitlePlaceholder",
"e.g., If you have any questions, please contact us.",
 )}
 disabled={!isEditing}
 />
 <p className="text-xs text-content-tertiary mt-1.5">
 {t(
"settings.footerSubtitleHint",
"This text will appear as the footer subtitle on your receipts",
 )}
 </p>
 </div>

 {isEditing && (
 <>
 <div className="border-t border-[var(--color-border-light)]" />
 <div className="flex justify-end gap-3">
 <Button
 variant="outline"
 size="sm"
 onClick={handleCancel}
 disabled={isSaving}
 >
 <X className="h-3.5 w-3.5 mr-1.5" />
 {t("common.cancel","Cancel")}
 </Button>
 <Button size="sm" onClick={handleSave} disabled={isSaving}>
 <Save className="h-3.5 w-3.5 mr-1.5" />
 {isSaving
 ? t("common.saving","Saving...")
 : t("common.save","Save")}
 </Button>
 </div>
 </>
 )}
 </div>
 )}
 </SettingsSection>
 );
};
