import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Order } from "../../lib/api";
import { documentError, documentEnvelope } from "../../lib/document-config";
import { useDocumentDraft } from "../../hooks/useDocumentDraft";
import { formatOrderNumber } from "../../lib/order-number";
import { DocumentEditor } from "../settings/DocumentEditor";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
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
  const [reconstruct, setReconstruct] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    "replace" | "discard" | null
  >(null);
  const active = order.receipts?.find((value) => value.status === "generated");
  const requestCommit = async () => {
    if (model.busy || !model.config) return;
    if (active) setPendingConfirm("replace");
    else await commit();
  };
  const commit = async () => {
    if (model.busy || !model.config) return;
    if (active && !active.active_revision && !reconstruct) {
      model.setError(t("document.reconstructionRequired"));
      return;
    }
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
    model.setBusy(true);
    model.setError("");
    try {
      await api.post(`/receipts/${active.id}/regenerate`, {
        mode: "reproduce",
        expectedActiveRevision: active.active_revision || 0,
      });
      await cache.invalidateQueries({ queryKey: ["orders"] });
      onClose();
    } catch (error) {
      model.setError(await documentError(error));
    } finally {
      model.setBusy(false);
    }
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
      <div className="space-y-4">
        <p className="text-sm font-medium text-content">
          {t("document.forOrder", {
            order: [
              order.order_number ? formatOrderNumber(order) : "",
              order.recipient?.name ?? "",
            ]
              .filter(Boolean)
              .join(" · "),
          })}
        </p>
        {active?.replacement_status === "failed" && (
          <div
            role="status"
            className="space-y-2 rounded-lg bg-surface-alt p-3 text-sm"
          >
            <p>{t("document.replacementFailed")}</p>
            <Button type="button" disabled={model.busy} onClick={retryFrozen}>
              {t("document.retryFrozen")}
            </Button>
          </div>
        )}
        {active && (
          <p className="rounded-lg bg-[var(--color-warning-light)] p-3 text-sm text-warning-base">
            {t("document.replaceHelp")}
          </p>
        )}
        {active && !active.active_revision && (
          <div className="space-y-2 rounded-lg bg-[var(--color-warning-light)] p-3 text-sm text-warning-base">
            <p>{t("document.reconstructionHelp")}</p>
            <label className="flex items-center gap-2 text-content">
              <input
                type="checkbox"
                checked={reconstruct}
                onChange={(event) => setReconstruct(event.target.checked)}
              />
              {t("document.reconstructionConfirm")}
            </label>
          </div>
        )}
        <DocumentEditor
          model={model}
          documentOnly
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
