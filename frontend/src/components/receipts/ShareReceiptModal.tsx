import { useState, useEffect, useRef } from"react";
import { Copy, Check, Unlink, Link2, Loader2 } from"lucide-react";
import { Modal } from"../ui/Modal";
import { Button } from"../ui/Button";
import { receiptsApi } from"../../lib/api";
import toast from"react-hot-toast";
import { useTranslation } from"../../hooks/useTranslation";
import { useSignoff } from"../../hooks/useSignoff";

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
 const signoff = useSignoff();
 // The link opens the PDF to anyone, so say so when a signature or stamp is stored.
 const hasSignoff = Boolean(signoff.data?.signature || signoff.data?.stamp);
 const [shareUrl, setShareUrl] = useState<string | null>(null);
 const [confirmingRevoke, setConfirmingRevoke] = useState(false);
 const [loading, setLoading] = useState(false);
 const [revoking, setRevoking] = useState(false);
 const [copied, setCopied] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [revokeError, setRevokeError] = useState<string | null>(null);
 const [copyError, setCopyError] = useState(false);

 useEffect(() => {
 if (isOpen && receiptId) {
 generateLink();
 }
 return () => {
 setShareUrl(null);
 setCopied(false);
 setError(null);
 setRevokeError(null);
 setCopyError(false);
 setConfirmingRevoke(false);
 };
 }, [isOpen, receiptId]);

 const urlFieldRef = useRef<HTMLInputElement>(null);

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
 try {
 await navigator.clipboard.writeText(shareUrl);
 setCopyError(false);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 } catch {
 // Insecure context or denied permission: leave the field selected so it can be copied by hand.
 setCopyError(true);
 urlFieldRef.current?.select();
 }
 };

 const handleRevoke = async () => {
 setRevoking(true);
 setRevokeError(null);
 try {
 await receiptsApi.revokeShare(receiptId);
 setShareUrl(null);
 setConfirmingRevoke(false);
 toast.success(t("receipts.linkRevoked"));
 onClose();
 } catch {
 setRevokeError(t("receipts.revokeError","Failed to revoke link"));
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
 <div className="min-w-0 flex-1 flex items-center gap-2 px-3 py-2 bg-surface-alt rounded-lg border border-[var(--color-border)]">
 <Link2 className="w-4 h-4 text-content-tertiary flex-shrink-0" />
 <input
 ref={urlFieldRef}
 readOnly
 value={shareUrl}
 aria-label={t("receipts.publicLink","Public link")}
 onFocus={(event) => event.currentTarget.select()}
 className="min-w-0 flex-1 bg-transparent text-sm text-content-secondary truncate font-mono outline-none"
 />
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
 {copyError && (
 <p role="alert" className="text-xs text-danger-base">
 {t("receipts.copyFailed")}
 </p>
 )}
 </div>

 {hasSignoff && (
 <p
 role="note"
 data-testid="share-signoff-note"
 className="p-3 rounded-lg bg-[var(--color-warning-light)] text-warning-base text-xs"
 >
 {t("signoff.shareNote")}
 </p>
 )}

 <div className="pt-2 border-t border-[var(--color-border-light)]">
 {confirmingRevoke ? (
 // Revoking breaks the link for everyone who already has it, so ask once.
 <div className="space-y-2">
 <p className="text-xs text-content-secondary">
 {t("receipts.revokeConfirm")}
 </p>
 {revokeError && (
 <p role="alert" className="text-xs text-danger-base">
 {revokeError}
 </p>
 )}
 <div className="flex gap-2">
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
 <Button
 size="sm"
 variant="secondary"
 onClick={() => setConfirmingRevoke(false)}
 disabled={revoking}
 >
 {t("receipts.keepLink")}
 </Button>
 </div>
 </div>
 ) : (
 <Button
 size="sm"
 variant="outline"
 onClick={() => setConfirmingRevoke(true)}
 className="text-danger-base border-[var(--color-danger-light)] hover:bg-[var(--color-danger-light)]"
 >
 <Unlink className="w-3.5 h-3.5 mr-1.5" />
 {t("receipts.revokeLink")}
 </Button>
 )}
 </div>
 </>
 )}
 </div>
 </Modal>
 );
};
