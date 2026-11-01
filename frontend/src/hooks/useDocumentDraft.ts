import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslation } from "./useTranslation";
import { api } from "../lib/api";
import {
  documentError,
  documentEnvelope,
  isDocumentRevisionConflict,
  type ConfigVersion,
  type DocumentConfig,
  type DocumentDraft,
} from "../lib/document-config";
export const DOCUMENT_CONFIG_KEY = ["settings", "document-config"] as const;
export function useDocumentDraft(orderId?: string) {
  const cache = useQueryClient();
  const { t } = useTranslation();
  const fieldLabel = (field: string) => {
    const key = `settings.${field}`;
    const label = t(key);
    return label === key ? undefined : label;
  };
  const query = useQuery({
    queryKey: DOCUMENT_CONFIG_KEY,
    queryFn: async () =>
      (await api.get<{ data: ConfigVersion }>("/settings/document-config")).data
        .data,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const [base, setBase] = useState<ConfigVersion>();
  const [draft, setDraft] = useState<DocumentConfig>();
  const [logoAction, setLogoAction] =
    useState<DocumentDraft["logoAction"]>("keep");
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isConflict, setIsConflict] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewVersion, setPreviewVersion] = useState(-1);
  const [refreshing, setRefreshing] = useState(false);
  const version = useRef(0),
    sequence = useRef(0),
    controller = useRef<AbortController | null>(null);
  const saved = base || query.data;
  const config = draft || saved?.config;
  const dirty = Boolean(
    config &&
      saved &&
      (JSON.stringify(config) !== JSON.stringify(saved.config) ||
        logoAction !== "keep"),
  );
  const changed = () => {
    version.current++;
    sequence.current++;
    controller.current?.abort();
    setRefreshing(false);
    setError("");
  };
  const update = (value: DocumentConfig) => {
    changed();
    setDraft(value);
  };
  const stageLogo = (action: DocumentDraft["logoAction"], value?: File) => {
    changed();
    setLogoAction(action);
    setFile(value);
  };
  const discard = () => {
    changed();
    setDraft(undefined);
    setLogoAction("keep");
    setFile(undefined);
  };
  const usePreset = (value: DocumentConfig) => {
    changed();
    setDraft(value);
    setLogoAction(value.logo.assetId ? "keep" : "remove");
    setFile(undefined);
  };
  useEffect(
    () => () => {
      controller.current?.abort();
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    controller.current?.abort();
    sequence.current++;
    setPreviewUrl("");
    setPreviewVersion(-1);
    setRefreshing(false);
  }, [orderId]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigation = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const target = new URL(link.href, window.location.href);
      if (
        target.pathname === window.location.pathname &&
        target.search === window.location.search
      )
        return;
      if (!window.confirm("Discard unsaved document changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const currentIndex: unknown = window.history.state?.idx;
    let restoring = false;
    const historyNavigation = (event: PopStateEvent) => {
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const nextIndex: unknown = event.state?.idx;
      if (
        typeof currentIndex === "number" &&
        typeof nextIndex === "number" &&
        currentIndex !== nextIndex &&
        !window.confirm("Discard unsaved document changes?")
      ) {
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(currentIndex - nextIndex);
      }
    };
    window.addEventListener("popstate", historyNavigation, true);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("popstate", historyNavigation, true);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
  const payload = (): DocumentDraft => {
    if (!config) throw new Error("Load settings first");
    if (config.title.mode === "custom" && !config.title.text.trim())
      throw new Error(t("document.titleRequired"));
    return { config, logoAction };
  };
  const save = async () => {
    if (!config || !saved || busy) return;
    setBusy(true);
    setError("");
    setIsConflict(false);
    try {
      const response = await api.put<{ data: ConfigVersion }>(
        "/settings/document-config",
        documentEnvelope(
          { ...payload(), expectedRevision: saved.revision },
          file,
        ),
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setBase(response.data.data);
      cache.setQueryData(DOCUMENT_CONFIG_KEY, response.data.data);
      setDraft(undefined);
      setLogoAction("keep");
      setFile(undefined);
      await cache.invalidateQueries({
        queryKey: ["settings", "receipt-design"],
      });
      // The save bar disappears once nothing is pending, so confirm the save here.
      toast.success(t("document.saved"));
    } catch (value) {
      setIsConflict(isDocumentRevisionConflict(value));
      setError(await documentError(value, fieldLabel));
    } finally {
      setBusy(false);
    }
  };
  const reloadSaved = async () => {
    if (busy) return;
    try {
      const value = await query.refetch();
      if (value.data) {
        setBase(value.data);
        setError("");
        setIsConflict(false);
      }
    } catch (value) {
      setError(await documentError(value, fieldLabel));
    }
  };
  const refreshPreview = async () => {
    if (!config) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const request = ++sequence.current,
      captured = version.current;
    setRefreshing(true);
    setError("");
    try {
      const response = await api.post(
        "/receipts/preview",
        documentEnvelope(
          { ...payload(), ...(orderId ? { orderId } : {}) },
          file,
        ),
        {
          headers: { "Content-Type": "multipart/form-data" },
          responseType: "blob",
          signal: abort.signal,
        },
      );
      if (request === sequence.current && captured === version.current) {
        setPreviewUrl(
          URL.createObjectURL(
            new Blob([response.data], { type: "application/pdf" }),
          ),
        );
        setPreviewVersion(captured);
      }
    } catch (value) {
      if (!abort.signal.aborted && request === sequence.current)
        setError(await documentError(value, fieldLabel));
    } finally {
      if (request === sequence.current) setRefreshing(false);
    }
  };
  return {
    query,
    config,
    saved,
    dirty,
    logoAction,
    file,
    busy,
    setBusy,
    error,
    isConflict,
    setError,
    update,
    stageLogo,
    discard,
    usePreset,
    payload,
    save,
    reloadSaved,
    refreshPreview,
    previewUrl,
    refreshing,
    stale: previewVersion !== version.current,
  };
}
export type DocumentDraftModel = ReturnType<typeof useDocumentDraft>;
