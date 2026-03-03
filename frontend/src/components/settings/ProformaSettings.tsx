import { useState, useEffect } from"react";
import { useMutation, useQueryClient } from"@tanstack/react-query";
import { FileText, Loader2 } from"lucide-react";
import { settingsApi } from"../../lib/api";
import { useTranslation } from"../../hooks/useTranslation";
import {
 useReceiptDesignSettings,
 RECEIPT_DESIGN_QUERY_KEY,
} from"../../hooks/useReceiptDesignSettings";

export const ProformaSettings = () => {
 const { t } = useTranslation();
 const queryClient = useQueryClient();

 const [paymentTerms, setPaymentTerms] = useState("");
 const [deliveryTerms, setDeliveryTerms] = useState("");

 const { data: designData, isLoading } = useReceiptDesignSettings();

 useEffect(() => {
 if (designData?.paymentTerms !== undefined) {
 setPaymentTerms(designData.paymentTerms);
 }
 if (designData?.deliveryTerms !== undefined) {
 setDeliveryTerms(designData.deliveryTerms);
 }
 }, [designData]);

 const paymentMutation = useMutation({
 mutationFn: (terms: string) => settingsApi.updatePaymentTerms(terms),
 onSuccess: () => {
 queryClient.invalidateQueries({
 queryKey: [...RECEIPT_DESIGN_QUERY_KEY],
 });
 },
 });

 const deliveryMutation = useMutation({
 mutationFn: (terms: string) => settingsApi.updateDeliveryTerms(terms),
 onSuccess: () => {
 queryClient.invalidateQueries({
 queryKey: [...RECEIPT_DESIGN_QUERY_KEY],
 });
 },
 });

 if (isLoading) {
 return (
 <div className="flex justify-center py-4">
 <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
 </div>
 );
 }

 return (
 <div className="rounded-xl border border-[var(--color-border)] bg-elevated p-6">
 <div className="flex items-center gap-3 mb-4">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-light)]">
 <FileText className="h-4 w-4 text-accent-base" />
 </div>
 <div>
 <h3 className="text-sm font-semibold text-content">
 {t("settings.proformaSettings","Proforma Settings")}
 </h3>
 <p className="text-xs text-content-tertiary">
 {t(
"settings.proformaSettingsDescription",
"Payment and delivery terms shown on proforma invoices",
 )}
 </p>
 </div>
 </div>

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1.5">
 {t("settings.paymentTermsLabel","Payment Terms")}
 </label>
 <textarea
 value={paymentTerms}
 onChange={(e) => setPaymentTerms(e.target.value)}
 onBlur={() => paymentMutation.mutate(paymentTerms)}
 placeholder={t(
"settings.paymentTermsPlaceholder",
"e.g., Net 30 days from invoice date",
 )}
 maxLength={500}
 rows={3}
 className="w-full rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm text-content placeholder-content-tertiary resize-none"
 />
 <div className="flex justify-between mt-1">
 <p className="text-xs text-content-tertiary">
 {t(
"settings.paymentTermsHint",
"Displayed on proforma invoice template",
 )}
 </p>
 <span className="text-xs text-content-tertiary">
 {paymentTerms.length}/500
 </span>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1.5">
 {t("settings.deliveryTermsLabel","Delivery Terms")}
 </label>
 <textarea
 value={deliveryTerms}
 onChange={(e) => setDeliveryTerms(e.target.value)}
 onBlur={() => deliveryMutation.mutate(deliveryTerms)}
 placeholder={t(
"settings.deliveryTermsPlaceholder",
"e.g., EXW, FOB, CIF — Incoterms 2020",
 )}
 maxLength={500}
 rows={3}
 className="w-full rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm text-content placeholder-content-tertiary resize-none"
 />
 <div className="flex justify-between mt-1">
 <p className="text-xs text-content-tertiary">
 {t(
"settings.deliveryTermsHint",
"Displayed on proforma invoice template",
 )}
 </p>
 <span className="text-xs text-content-tertiary">
 {deliveryTerms.length}/500
 </span>
 </div>
 </div>
 </div>

 {(paymentMutation.isPending || deliveryMutation.isPending) && (
 <div className="flex items-center gap-2 mt-3 text-xs text-content-tertiary">
 <Loader2 className="h-3 w-3 animate-spin" />
 {t("common.saving","Saving...")}
 </div>
 )}
 </div>
 );
};
