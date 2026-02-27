/**
 * Утилиты для работы с PDF файлами
 */

/**
 * Определяет, работает ли приложение на iOS (iPhone, iPad, iPod)
 */
export const isIOS = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};

/**
 * Скачивает PDF файл из blob данных.
 * На iOS Safari использует window.open вместо <a download>,
 * т.к. download-атрибут в Safari приводит к дублированию файла при шеринге.
 */
export const downloadPdf = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);

  if (isIOS()) {
    window.open(url, "_blank");
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

/**
 * Открывает PDF в новой вкладке
 */
export const openPdfInNewTab = (blob: Blob) => {
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};
