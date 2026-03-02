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

/**
 * Открывает PDF в новой вкладке браузера.
 * Вызывать ТОЛЬКО из синхронного обработчика клика
 * (до любого await), иначе popup blocker заблокирует window.open.
 */
export const openPdfInNewTab = (blob: Blob) => {
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};
