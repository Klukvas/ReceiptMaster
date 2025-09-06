/**
 * Утилиты для работы с PDF файлами
 */

/**
 * Скачивает PDF файл из blob данных
 */
export const downloadPdf = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * Открывает PDF в новой вкладке
 */
export const openPdfInNewTab = (blob: Blob) => {
  const url = window.URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Освобождаем память через некоторое время
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};
