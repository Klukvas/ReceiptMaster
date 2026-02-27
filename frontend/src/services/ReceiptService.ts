import { receiptsApi } from "../lib/api";
import { notificationService } from "./NotificationService";
import { parseApiError } from "../lib/api-errors";
import { isIOS } from "../lib/pdf-utils";

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export class ReceiptService {
  private availablePrinters: string[] = [];

  async loadPrinters(): Promise<string[]> {
    try {
      const response = await receiptsApi.getPrinters();
      this.availablePrinters = response.data.printers;
      return this.availablePrinters;
    } catch (error) {
      const apiError = parseApiError(error);
      console.error("Error loading printers:", apiError);
      notificationService.error(apiError.message);
      return [];
    }
  }

  getAvailablePrinters(): string[] {
    return [...this.availablePrinters];
  }

  async downloadReceipt(receiptId: string): Promise<void> {
    try {
      const response = await receiptsApi.getPdf(receiptId);

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      if (isIOS()) {
        // iOS Safari: <a download> с blob URL создаёт и загрузку, и навигацию,
        // в результате при шеринге отправляется 2 файла.
        // Открываем PDF в новой вкладке — Safari покажет встроенный просмотрщик
        // с корректной кнопкой «Поделиться» (1 файл).
        window.open(url, "_blank");
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `receipt-${receiptId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }

      notificationService.success("Receipt downloaded successfully");
    } catch (error) {
      const apiError = parseApiError(error);
      console.error("Error downloading receipt:", apiError);
      notificationService.error(apiError.message);
    }
  }

  async printReceipt(receiptId: string, printer?: string): Promise<void> {
    try {
      const response = await receiptsApi.print(receiptId, printer);

      if (response.data.success) {
        notificationService.success(response.data.message);
      } else {
        notificationService.error(response.data.message);
      }
    } catch (error) {
      const apiError = parseApiError(error);
      console.error("Error printing receipt:", apiError);
      notificationService.error(apiError.message);
    }
  }

  async generateReceipt(orderId: string): Promise<void> {
    try {
      await receiptsApi.create(orderId);
      notificationService.success("Receipt generated successfully");
    } catch (error) {
      const apiError = parseApiError(error);
      console.error("Error generating receipt:", apiError);
      notificationService.error(apiError.message);
    }
  }

  async handlePrintReceipt(receiptId: string): Promise<void> {
    if (this.availablePrinters.length > 1) {
      const printer = prompt(
        `Available printers: ${this.availablePrinters.join(", ")}\nEnter printer name (or leave empty for default):`,
      );
      await this.printReceipt(receiptId, printer || undefined);
    } else {
      await this.printReceipt(receiptId);
    }
  }
}

// Singleton instance
export const receiptService = new ReceiptService();
