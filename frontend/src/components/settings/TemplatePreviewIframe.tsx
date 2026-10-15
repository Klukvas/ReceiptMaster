import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { receiptsApi } from "../../lib/api";
import { useTranslation } from "../../hooks/useTranslation";

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const THERMAL_WIDTH = (80 * 96) / 25.4;

interface TemplatePreviewIframeProps {
  templateId: string;
  language: string;
  height?: number;
  interactive?: boolean;
}

export const TemplatePreviewIframe = ({
  templateId,
  language,
  height = 160,
  interactive = false,
}: TemplatePreviewIframeProps) => {
  const { t } = useTranslation();
  const [containerWidth, setContainerWidth] = useState(0);
  const [rollHeight, setRollHeight] = useState(A4_HEIGHT);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isThermal = templateId === "thermal";
  const pageWidth = isThermal ? THERMAL_WIDTH : A4_WIDTH;
  const scale = isThermal
    ? Math.min(containerWidth / pageWidth, 1)
    : containerWidth / pageWidth;

  const updateScale = useCallback(() => {
    if (containerRef.current)
      setContainerWidth(containerRef.current.clientWidth);
  }, []);

  useEffect(() => {
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateScale]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { data: html, isError } = useQuery({
    queryKey: ["template-preview", templateId, language],
    queryFn: async () =>
      (await receiptsApi.getTemplatePreviewHtml(templateId, language)).data,
    enabled: visible,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const measureRoll = useCallback(
    async (iframe: HTMLIFrameElement) => {
      const document = iframe.contentDocument;
      if (!document || !isThermal) return;
      await document.fonts.ready;
      if (iframe.contentDocument !== document) return;
      const paddingBottom = parseFloat(
        getComputedStyle(document.documentElement).paddingBottom,
      );
      setRollHeight(
        Math.ceil(
          document.body.getBoundingClientRect().bottom + paddingBottom + 2,
        ),
      );
    },
    [isThermal],
  );

  const previewHtml = html?.replace(
    "</head>",
    `<style>@media screen { html { padding: ${isThermal ? "3mm 2mm" : "5mm"}; } }</style></head>`,
  );
  const format = isThermal ? t("settings.thermalFormat") : "A4";

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg bg-elevated"
      style={{ height }}
    >
      {html === undefined && !isError && (
        <div className="absolute inset-0 bg-surface-alt animate-pulse rounded-lg" />
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-alt rounded-lg">
          <span className="text-xs text-content-tertiary">
            {t("settings.templateLoadError")}
          </span>
        </div>
      )}
      {scale > 0 && previewHtml !== undefined && (
        <iframe
          key={`${templateId}-${language}`}
          srcDoc={previewHtml}
          title={t("settings.templatePreview", {
            template: templateId,
            format,
          })}
          // No scripts or navigation are allowed. Same-origin access measures the roll after fonts load.
          sandbox="allow-same-origin"
          onLoad={(event) => {
            void measureRoll(event.currentTarget);
          }}
          className="border-0 origin-top-left"
          style={{
            width: pageWidth,
            height: isThermal ? rollHeight : A4_HEIGHT,
            marginLeft: isThermal
              ? Math.max(0, (containerWidth - pageWidth * scale) / 2)
              : 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      )}
      {!interactive && (
        <div className="absolute inset-0" style={{ pointerEvents: "all" }} />
      )}
    </div>
  );
};
