import { useState, useRef, useEffect, useCallback } from "react";
import { receiptsApi } from "../../lib/api";

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

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
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateScale = useCallback(() => {
    if (containerRef.current) {
      setScale(containerRef.current.clientWidth / A4_WIDTH);
    }
  }, []);

  // ResizeObserver for dynamic scaling
  useEffect(() => {
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [updateScale]);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch HTML via authenticated API
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setHtml(null);
    setError(false);

    receiptsApi
      .getTemplatePreviewHtml(templateId, language)
      .then((res) => {
        if (!cancelled) setHtml(res.data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [templateId, language, visible]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg bg-white"
      style={{ height }}
    >
      {/* Loading skeleton */}
      {html === null && !error && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700/50 animate-pulse rounded-lg" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
          <span className="text-xs text-gray-400">Failed to load</span>
        </div>
      )}

      {scale > 0 && html !== null && (
        <iframe
          srcDoc={html}
          title={`Preview ${templateId}`}
          sandbox=""
          className="border-0 origin-top-left"
          style={{
            width: A4_WIDTH,
            height: A4_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      )}

      {/* Block interaction overlay */}
      {!interactive && (
        <div className="absolute inset-0" style={{ pointerEvents: "all" }} />
      )}
    </div>
  );
};
