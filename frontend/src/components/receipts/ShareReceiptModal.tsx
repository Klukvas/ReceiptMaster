import { useState, useEffect } from"react";
import { Copy, Check, Unlink, Link2, Loader2 } from"lucide-react";
import { Modal } from"../ui/Modal";
import { Button } from"../ui/Button";
import { receiptsApi } from"../../lib/api";
import { useTranslation } from"../../hooks/useTranslation";

interface ShareReceiptModalProps {
 isOpen: boolean;
 onClose: () => void;
 receiptId: string;
}

export const ShareReceiptModal = ({
 isOpen,
 onClose,
 receiptId,
}: ShareReceiptModalProps) => {
 const { t } = useTranslation();
 const [shareUrl, setShareUrl] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const [revoking, setRevoking] = useState(false);
 const [copied, setCopied] = useState(false);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 if (isOpen && receiptId) {
 generateLink();
 }
 return () => {
 setShareUrl(null);
 setCopied(false);
 setError(null);
 };
 }, [isOpen, receiptId]);

 const generateLink = async () => {
 setLoading(true);
 setError(null);
 try {
 const { data } = await receiptsApi.share(receiptId);
 setShareUrl(data.url);
 } catch {
 setError(t("receipts.shareError","Failed to generate share link"));
 } finally {
 setLoading(false);
 }
 };

 const handleCopy = async () => {
 if (!shareUrl) return;
 await navigator.clipboard.writeText(shareUrl);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 const handleRevoke = async () => {
 setRevoking(true);
 try {
 await receiptsApi.revokeShare(receiptId);
 setShareUrl(null);
 onClose();
 } catch {
 setError(t("receipts.revokeError","Failed to revoke link"));
 } finally {
 setRevoking(false);
 }
 };

 return (
 <Modal
 isOpen={isOpen}
 onClose={onClose}
 title={t("receipts.shareReceipt")}
 size="sm"
 >
 <div className="space-y-4">
 {loading && (
 <div className="flex items-center justify-center py-8">
 <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
 </div>
 )}

 {error && (
 <div className="p-3 rounded-lg bg-[var(--color-danger-light)] text-danger-base text-sm">
 {error}
 </div>
 )}

 {shareUrl && !loading && (
 <>
 <div className="space-y-2">
 <label className="text-sm font-medium text-content-secondary">
 {t("receipts.publicLink","Public link")}
 </label>
 <div className="flex items-center gap-2">
 <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-surface-alt rounded-lg border border-[var(--color-border)]">
 <Link2 className="w-4 h-4 text-content-tertiary flex-shrink-0" />
 <span className="text-sm text-content-secondary truncate font-mono">
 {shareUrl}
 </span>
 </div>
 <Button
 size="sm"
 variant={copied ?"success" :"primary"}
 onClick={handleCopy}
 className="flex-shrink-0"
 >
 {copied ? (
 <>
 <Check className="w-3.5 h-3.5 mr-1" />
 {t("receipts.linkCopied")}
 </>
 ) : (
 <>
 <Copy className="w-3.5 h-3.5 mr-1" />
 {t("receipts.copyLink")}
 </>
 )}
 </Button>
 </div>
 </div>

 <div className="pt-2 border-t border-[var(--color-border-light)]">
 <Button
 size="sm"
 variant="outline"
 onClick={handleRevoke}
 disabled={revoking}
 className="text-danger-base border-[var(--color-danger-light)] hover:bg-[var(--color-danger-light)]"
 >
 {revoking ? (
 <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
 ) : (
 <Unlink className="w-3.5 h-3.5 mr-1.5" />
 )}
 {t("receipts.revokeLink")}
 </Button>
 </div>
 </>
 )}
 </div>
 </Modal>
 );
};
