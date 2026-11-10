/**
 * Утилиты для скачивания файлов (PDF, CSV и т.д.)
 *
 * Используем единый подход <a download> для ВСЕХ браузеров (включая Safari).
 * Ключевой момент — revokeObjectURL вызывается с задержкой 10 с,
 * чтобы Safari успел начать чтение blob (Safari делает это асинхронно).
 * Это тот же паттерн, что использует FileSaver.js.
 */

const REVOKE_DELAY_MS = 10_000;

/**
 * Скачивает blob как файл через скрытый <a download>.
 * Работает во всех современных браузерах (Chrome, Firefox, Safari 14.1+, Edge).
 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
};

/**
 * Скачивает PDF файл из blob данных.
 * Семантический алиас для downloadBlob.
 */
export const downloadPdf = downloadBlob;

/** Long enough for the browser's PDF viewer to have read the blob. */
const PDF_TAB_REVOKE_DELAY_MS = 60_000;

/**
 * Открывает PDF в новой вкладке браузера.
 * Вызывать ТОЛЬКО из синхронного обработчика клика
 * (до любого await), иначе popup blocker заблокирует window.open.
 */
export const openPdfInNewTab = (blob: Blob) => {
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => window.URL.revokeObjectURL(url), PDF_TAB_REVOKE_DELAY_MS);
};

/** A tab opened during a click, to be filled with a PDF that is still being fetched. */
export interface PendingPdfTab {
  show: (blob: Blob) => void;
  close: () => void;
}

/**
 * Opens an empty tab now and shows the PDF in it later. Browsers allow `window.open` only
 * while the click is being handled, so call this before the first `await`. Returns null
 * when the tab was blocked.
 */
export const openPendingPdfTab = (): PendingPdfTab | null => {
  const tab = window.open("", "_blank");
  if (!tab) return null;
  return {
    show: (blob) => {
      const url = window.URL.createObjectURL(blob);
      tab.location.href = url;
      setTimeout(
        () => window.URL.revokeObjectURL(url),
        PDF_TAB_REVOKE_DELAY_MS,
      );
    },
    close: () => tab.close(),
  };
};
