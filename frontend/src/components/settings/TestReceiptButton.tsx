import { useState } from"react";
import { FileText, Loader2, Download, Eye } from"lucide-react";
import { receiptsApi } from"../../lib/api";
import { previewRateLimitText } from"../../lib/api-errors";
import { Button } from"../ui/Button";
import { SettingsSection } from"./SettingsSection";
import { useTranslation } from"../../hooks/useTranslation";
import { downloadPdf, openPdfInNewTab } from"../../lib/pdf-utils";

export const TestReceiptButton = () => {
 const { t } = useTranslation();
 const [isGenerating, setIsGenerating] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // A 429 is either the rate limit (with its wait) or a preview of this account still rendering.
 const failureText = async (error: unknown): Promise<string> =>
 (await previewRateLimitText(error)) ?? t("settings.testReceiptError","Failed to generate test receipt");

 const handleTestPreview = async () => {
 setIsGenerating(true);
 setError(null);
 try {
 const response = await receiptsApi.testPreview();
 const blob = new Blob([response.data], { type:"application/pdf" });
 openPdfInNewTab(blob);
 } catch (error) {
 setError(await failureText(error));
 } finally {
 setIsGenerating(false);
 }
 };

 const handleTestDownload = async () => {
 setIsGenerating(true);
 setError(null);
 try {
 const response = await receiptsApi.testPreview();
 const blob = new Blob([response.data], { type:"application/pdf" });
 downloadPdf(blob,"test-receipt.pdf");
 } catch (error) {
 setError(await failureText(error));
 } finally {
 setIsGenerating(false);
 }
 };

 return (
 <SettingsSection
 title={t("settings.previewReceiptTitle","Preview Receipt")}
 description={t(
"settings.testReceiptDesc",
"Generate a sample receipt using your current settings to preview how it will look.",
 )}
 icon={<Eye className="h-5 w-5" />}
 >
 <div className="flex flex-col sm:flex-row items-start gap-3">
 <Button onClick={handleTestPreview} disabled={isGenerating} size="sm">
 {isGenerating ? (
 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
 ) : (
 <FileText className="h-4 w-4 mr-2" />
 )}
 {t("settings.previewReceipt","Preview PDF")}
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={handleTestDownload}
 disabled={isGenerating}
 >
 <Download className="h-4 w-4 mr-2" />
 {t("settings.downloadTest","Download Sample")}
 </Button>
 </div>
 {error && (
 <p className="text-sm text-danger-base mt-3">{error}</p>
 )}
 </SettingsSection>
 );
};
