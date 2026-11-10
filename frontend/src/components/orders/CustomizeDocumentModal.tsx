import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Order, type Receipt } from "../../lib/api";
import { notifyIssueWarnings } from "../../lib/issue-warnings";
import { documentEnvelope, type DocumentConfig } from "../../lib/document-config";
import { localizedDocumentError } from "../../lib/document-error";
import { isGeneratableType, waybillOf } from "../../lib/document-types";
import { useDocumentTemplates } from "../../hooks/useDocumentTemplates";
import { useDocumentDraft } from "../../hooks/useDocumentDraft";
import { DocumentEditor, type EditorSection } from "../settings/DocumentEditor";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
import { Modal } from "../ui/Modal";
import { useTranslation } from "../../hooks/useTranslation";
export function CustomizeDocumentModal({
  order,
  document,
  onClose,
}: {
  order: Order;
  /** The document to replace; the order's waybill when omitted. */
  document?: Receipt;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const model = useDocumentDraft(order.id);
  const [section, setSection] = useState<EditorSection>("receipt");
  const [reconstruct, setReconstruct] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    "replace" | "discard" | null
  >(null);
  // Only the targeted document is replaced; the order's other documents are not touched.
  const waybill = document ?? waybillOf(order);
  const active = waybill?.status === "generated" ? waybill : undefined;
  const documentType =
    waybill && isGeneratableType(waybill.document_type)
      ? waybill.document_type
      : undefined;
  const templates = useDocumentTemplates();
  const draftTemplateId = model.config?.templateId;
  // The draft starts from the account's design, which may be one the document type
  // cannot use (thermal for an invoice); switch to one that fits instead of failing later.
  useEffect(() => {
    const config = model.config;
    if (!documentType || !config || !templates.data) return;
    const current = templates.data.find((item) => item.id === config.templateId);
    if (!current || current.capabilities.documentTypes.includes(documentType)) return;
    const fallback = templates.data.find(
      (item) => !item.locked && item.capabilities.documentTypes.includes(documentType),
    );
    if (fallback)
      model.update({ ...config, templateId: fallback.id as DocumentConfig["templateId"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a changed design or loaded list matters
  }, [documentType, draftTemplateId, templates.data]);
  const requestCommit = async () => {
    if (model.busy || !model.config) return;
    if (active) setPendingConfirm("replace");
    else await commit();
  };
  const commit = async () => {
    if (model.busy || !model.config) return;
    model.setBusy(true);
    model.setError("");
    try {
      const payload = {
        ...model.payload(),
        ...(active
          ? {
              mode: "replace",
              expectedActiveRevision: active.active_revision || 0,
              confirmReconstruction: reconstruct,
            }
          : {}),
      };
      const response = await api.post(
        active
          ? `/receipts/${active.id}/regenerate`
          : `/receipts/orders/${order.id}/receipt`,
        documentEnvelope(payload, model.file),
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      notifyIssueWarnings(response.data);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["orders"] }),
        cache.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
      onClose();
    } catch (error) {
      model.setError(await localizedDocumentError(error));
    } finally {
      model.setBusy(false);
    }
  };
  const retryFrozen = async () => {
    if (!active || model.busy) return;
    model.setBusy(true); model.setError("");
    try {
      await api.post(`/receipts/${active.id}/regenerate`, { mode: "reproduce", expectedActiveRevision: active.active_revision || 0 });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["orders"] }),
        cache.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
      onClose();
    } catch (error) { model.setError(await localizedDocumentError(error)); } finally { model.setBusy(false); }
  };
  const close = () => {
    if (model.busy) return;
    if (model.dirty) setPendingConfirm("discard");
    else onClose();
  };
  const confirmPending = () => {
    const confirmed = pendingConfirm;
    setPendingConfirm(null);
    if (confirmed === "replace") void commit();
    if (confirmed === "discard") onClose();
  };
  return (
    <Modal
      isOpen
      title={t(
        active ? "document.replaceDocument" : "document.customizeDocument",
      )}
      onClose={close}
      size="xl"
    >
      <div className="max-h-[82vh] overflow-y-auto space-y-4">
        {active?.replacement_status === "failed" && <div role="status" className="rounded-lg bg-surface-alt p-3"><p>{t("document.replacementFailed")}</p><Button type="button" disabled={model.busy} onClick={retryFrozen}>{t("document.retryFrozen")}</Button></div>}

        {active && (
          <p className="text-sm text-warning-base">
            {t("document.replaceHelp")}
          </p>
        )}
        {active && !active.active_revision && (
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={reconstruct}
              onChange={(event) => setReconstruct(event.target.checked)}
            />{" "}
            {t("document.reconstructionHelp")}
          </label>
        )}
        <nav className="flex gap-2">
          {(["company", "receipt", "language"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={`rounded-lg px-3 py-2 text-sm ${value === section ? "bg-surface-alt text-accent-base" : "text-content-secondary"}`}
              onClick={() => setSection(value)}
            >
              {t(
                `settings.${value === "company" ? "tabCompany" : value === "receipt" ? "tabReceipt" : "tabLanguage"}`,
              )}
            </button>
          ))}
        </nav>
        <DocumentEditor
          model={model}
          section={section}
          documentOnly
          documentType={documentType}
          onCommit={requestCommit}
          commitLabel={active ? t("document.replaceDocument") : undefined}
        />
      </div>
      <ConfirmModal
        isOpen={pendingConfirm !== null}
        onClose={() => setPendingConfirm(null)}
        onConfirm={confirmPending}
        variant="warning"
        title={
          pendingConfirm === "discard"
            ? t("document.discard")
            : t("document.replaceDocument")
        }
        message={
          pendingConfirm === "discard"
            ? t("document.discardConfirm")
            : t("document.replaceConfirm")
        }
        confirmLabel={
          pendingConfirm === "discard"
            ? t("document.discard")
            : t("document.replaceDocument")
        }
      />
    </Modal>
  );
}
