import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  documentError,
  documentEnvelope,
  type Preset,
  type PresetSummary,
} from "../../lib/document-config";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { selectClass } from "./DocumentFormatting";
export function DocumentPresets({ model }: { model: DocumentDraftModel }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState<Preset>();
  const [name, setName] = useState("");
  const presets = useQuery({
    queryKey: ["document-presets"],
    queryFn: async () =>
      (await api.get<{ data: PresetSummary[] }>("/settings/document-presets"))
        .data.data,
    retry: false,
  });
  const act = async (action: "use" | "create" | "update" | "delete") => {
    if (model.busy) return;
    model.setBusy(true);
    model.setError("");
    try {
      if (action === "use") {
        const value = (
          await api.get<{ data: Preset }>(
            `/settings/document-presets/${selected}`,
          )
        ).data.data;
        setLoaded(value);
        setName(value.name);
        model.usePreset(value.config);
      } else if (action === "delete") {
        if (!loaded || !window.confirm(t("document.deletePresetConfirm")))
          return;
        await api.delete(`/settings/document-presets/${loaded.id}`, {
          data: { expectedRevision: loaded.revision },
        });
        setSelected("");
        setLoaded(undefined);
        setName("");
      } else {
        const payload = {
          ...model.payload(),
          name,
          ...(action === "update" && loaded
            ? { expectedRevision: loaded.revision }
            : {}),
        };
        const response = await api.request<{ data: Preset }>({
          method: action === "create" ? "POST" : "PUT",
          url: `/settings/document-presets${action === "update" && loaded ? `/${loaded.id}` : ""}`,
          data: documentEnvelope(payload, model.file),
          headers: { "Content-Type": "multipart/form-data" },
        });
        setLoaded(response.data.data);
        setSelected(response.data.data.id);
        model.usePreset(response.data.data.config);
      }
      await presets.refetch();
    } catch (error) {
      model.setError(await documentError(error));
    } finally {
      model.setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-elevated p-4">
      <h3 className="font-semibold text-content">{t("document.presets")}</h3>
      <p className="text-sm text-content-tertiary">
        {t("document.presetsHelp")}
      </p>
      {presets.isError && (
        <button type="button" onClick={() => presets.refetch()}>
          {t("common.retry")}
        </button>
      )}
      <div className="flex gap-2">
        <label className="grow text-sm">
          {t("document.savedPresets")}
          <select
            aria-label={t("document.savedPresets")}
            className={selectClass}
            value={selected}
            disabled={model.busy}
            onChange={(event) => {
              setSelected(event.target.value);
              setLoaded(undefined);
            }}
          >
            <option value="">{t("document.choosePreset")}</option>
            {presets.data?.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name} · {value.revision}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!selected || model.busy}
          onClick={() => act("use")}
        >
          {t("document.usePreset")}
        </Button>
      </div>
      <Input
        label={t("document.presetName")}
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
        disabled={model.busy}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={
            !name.trim() || model.busy || (presets.data?.length || 0) >= 20
          }
          onClick={() => act("create")}
        >
          {t("document.saveAsPreset")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!loaded || !name.trim() || model.busy}
          onClick={() => act("update")}
        >
          {t("document.updatePreset")}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={!loaded || model.busy}
          onClick={() => act("delete")}
        >
          {t("common.delete")}
        </Button>
      </div>
    </section>
  );
}
