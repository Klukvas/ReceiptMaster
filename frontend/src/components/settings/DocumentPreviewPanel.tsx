import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DocumentDraftModel } from "../../hooks/useDocumentDraft";
import { useAutoPreview } from "../../hooks/useAutoPreview";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../ui/Button";

const WIDE_SCREEN = "(min-width: 1024px)";

/**
 * The PDF preview. Beside the form on a wide screen (open at once), a collapsed card
 * on a phone (opened on demand, since a PDF render is wasted work if nobody looks).
 * While open it keeps itself up to date as the form changes.
 */
export function DocumentPreviewPanel({
  model,
  title,
}: {
  model: DocumentDraftModel;
  title?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(WIDE_SCREEN).matches,
  );
  useAutoPreview(model, open);

  const status = model.previewPaused
    ? t("document.previewPaused")
    : model.refreshing
      ? t("document.previewUpdating")
      : model.stale
        ? t("document.previewStale")
        : t("document.previewCurrent");

  return (
    <section
      aria-labelledby="document-preview-title"
      className="min-w-0 self-start rounded-xl border border-[var(--color-border)] bg-elevated p-4 lg:sticky lg:top-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="document-preview-title" className="font-semibold text-content">
          {title ?? t("document.pdfPreview")}
        </h3>
        <div className="flex items-center gap-2">
          {open && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={model.refreshing}
              onClick={model.refreshPreview}
            >
              {t("document.refreshPreview")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls="document-preview-body"
            onClick={() => setOpen((value) => !value)}
            className="lg:hidden"
          >
            {open ? t("document.hidePreview") : t("document.showPreview")}
            <ChevronDown
              aria-hidden
              className={`ml-1 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
      </div>
      <div id="document-preview-body" hidden={!open}>
        <p role="status" className="my-3 text-sm text-content-tertiary">
          {status}
        </p>
        {model.previewError && (
          <p role="alert" className="mb-3 text-sm text-danger-base">
            {model.previewError}
          </p>
        )}
        {model.previewUrl ? (
          <>
            <iframe
              title={title ?? t("document.pdfPreview")}
              src={model.previewUrl}
              className="h-[420px] w-full rounded-lg border border-[var(--color-border)] lg:h-[620px]"
            />
            <a
              href={model.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent-base"
            >
              {t("document.openPreview")}
            </a>
          </>
        ) : (
          <div className="flex h-60 items-center justify-center rounded-lg bg-surface-alt p-6 text-center text-sm text-content-tertiary lg:h-80">
            {t("document.previewHelp")}
          </div>
        )}
      </div>
    </section>
  );
}
