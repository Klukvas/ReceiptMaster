import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Order } from "../../lib/api";
import { documentError, documentEnvelope } from "../../lib/document-config";
import { useDocumentDraft } from "../../hooks/useDocumentDraft";
import { DocumentEditor, type EditorSection } from "../settings/DocumentEditor";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useTranslation } from "../../hooks/useTranslation";
export function CustomizeDocumentModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const model = useDocumentDraft(order.id);
  const [section, setSection] = useState<EditorSection>("receipt");
  const [reconstruct, setReconstruct] = useState(false);
  const active = order.receipts?.find((value) => value.status === "generated");
  const commit = async () => {
    if (model.busy || !model.config) return;
    if (active && !window.confirm(t("document.replaceConfirm"))) return;
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
      await api.post(
        active
          ? `/receipts/${active.id}/regenerate`
          : `/receipts/orders/${order.id}/receipt`,
        documentEnvelope(payload, model.file),
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["orders"] }),
        cache.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
      onClose();
    } catch (error) {
      model.setError(await documentError(error));
    } finally {
      model.setBusy(false);
    }
  };
  const retryFrozen = async () => {
    if (!active || model.busy) return;
    model.setBusy(true); model.setError("");
    try {
      await api.post(`/receipts/${active.id}/regenerate`, { mode: "reproduce", expectedActiveRevision: active.active_revision || 0 });
      await cache.invalidateQueries({ queryKey: ["orders"] }); onClose();
    } catch (error) { model.setError(await documentError(error)); } finally { model.setBusy(false); }
  };
  const close = () => {
    if (
      !model.busy &&
      (!model.dirty || window.confirm(t("document.discardConfirm")))
    )
      onClose();
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
          onCommit={commit}
          commitLabel={active ? t("document.replaceDocument") : undefined}
        />
      </div>
    </Modal>
  );
}
