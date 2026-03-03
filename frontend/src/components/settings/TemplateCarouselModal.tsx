import { useEffect, useState, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { clsx } from "clsx";
import { TemplatePreviewIframe } from "./TemplatePreviewIframe";
import { useTranslation } from "../../hooks/useTranslation";

interface Template {
  id: string;
  name: string;
  description: string;
}

interface TemplateCarouselModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: Template[];
  initialTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
}

export const TemplateCarouselModal = ({
  isOpen,
  onClose,
  templates,
  initialTemplateId,
  onSelectTemplate,
}: TemplateCarouselModalProps) => {
  const { t, currentLanguage } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(600);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Sync index when modal opens or initialTemplateId changes
  useEffect(() => {
    if (isOpen) {
      const idx = templates.findIndex((tpl) => tpl.id === initialTemplateId);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, initialTemplateId, templates]);

  // Focus the close button when modal opens
  useEffect(() => {
    if (isOpen) {
      // Delay to allow the DOM to render
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Track preview area height with ResizeObserver
  useEffect(() => {
    if (!isOpen) return;

    const el = previewAreaRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const padding = 48; // py-6 = 24px * 2
      setPreviewHeight(Math.max(entry.contentRect.height - padding, 200));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  const goTo = useCallback(
    (direction: "prev" | "next") => {
      setCurrentIndex((prev) => {
        if (direction === "next") {
          return prev >= templates.length - 1 ? 0 : prev + 1;
        }
        return prev <= 0 ? templates.length - 1 : prev - 1;
      });
    },
    [templates.length],
  );

  // Keyboard navigation + ESC close + scroll lock + focus trap
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") goTo("prev");
      if (e.key === "ArrowRight") goTo("next");

      // Focus trap on Tab
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose, goTo]);

  if (!isOpen || templates.length === 0) return null;

  const current = templates[currentIndex];

  const handleSelect = () => {
    onSelectTemplate(current.id);
    onClose();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="carousel-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 animate-modal-backdrop"
        onClick={onClose}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full animate-modal-content">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-elevated border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <h2
              id="carousel-dialog-title"
              className="text-lg font-semibold text-content truncate"
            >
              {current.name}
            </h2>
            <p className="text-sm text-content-tertiary truncate">
              {current.description}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-2 text-content-tertiary hover:text-content-secondary hover:bg-surface-alt transition-colors"
            aria-label={t("common.close", "Close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview area */}
        <div
          ref={previewAreaRef}
          className="relative flex-1 flex items-center justify-center px-4 sm:px-8 lg:px-16 py-6 overflow-hidden"
        >
          {/* Left arrow */}
          <button
            onClick={() => goTo("prev")}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-elevated border border-[var(--color-border)] text-content-secondary shadow-md hover:bg-surface-alt transition-colors"
            aria-label={t("common.previous", "Previous template")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Iframe container */}
          <div className="w-full max-w-2xl h-full">
            <TemplatePreviewIframe
              templateId={current.id}
              language={currentLanguage}
              height={previewHeight}
            />
          </div>

          {/* Right arrow */}
          <button
            onClick={() => goTo("next")}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-elevated border border-[var(--color-border)] text-content-secondary shadow-md hover:bg-surface-alt transition-colors"
            aria-label={t("common.next", "Next template")}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-elevated border-t border-[var(--color-border)]">
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {templates.map((tpl, i) => (
              <button
                key={tpl.id}
                onClick={() => setCurrentIndex(i)}
                className={clsx(
                  "h-2 rounded-full transition-all duration-200",
                  i === currentIndex
                    ? "w-4 bg-accent-base"
                    : "w-2 bg-surface-alt hover:bg-surface-alt",
                )}
                aria-label={tpl.name}
              />
            ))}
          </div>

          {/* Select button */}
          <button
            onClick={handleSelect}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-base px-4 py-2 text-sm font-medium text-white hover:bg-accent-base transition-colors"
          >
            <Check className="h-4 w-4" />
            {t("settings.selectTemplate", "Select This Template")}
          </button>
        </div>
      </div>
    </div>
  );
};
