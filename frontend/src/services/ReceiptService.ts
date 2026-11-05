import { receiptsApi, type DocumentRequestBody, type Receipt } from "../lib/api";
import type { DocumentType } from "../lib/document-types";
import { notificationService } from "./NotificationService";
import { parseApiError } from "../lib/api-errors";
import i18n from "../lib/i18n";
import { downloadPdf } from "../lib/pdf-utils";

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

function retryBody(type: DocumentType): DocumentRequestBody {
  if (type === "act") return { type: "act", details: {} };
  return { type: "invoice", details: {} };
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

  /**
   * Current server-side state of a receipt.
   *
   * Used to resolve a progress card whose completion event never arrived, so a
   * lookup failure is not user-facing: it is logged and the caller keeps
   * showing progress and retries on the next tick.
   */
  async fetchReceipt(receiptId: string): Promise<Receipt | null> {
    try {
      const response = await receiptsApi.getById(receiptId);
      return response.data;
    } catch (error) {
      const apiError = parseApiError(error);
      console.error(`Error loading receipt ${receiptId}:`, apiError);
      return null;
    }
  }

  /** `<type>-<number>`, so an invoice and a waybill of one order do not collide on disk. */
  private async documentFileStem(receiptId: string): Promise<string> {
    const document = await this.fetchReceipt(receiptId);
    return document
      ? `${document.document_type}-${document.number}`
      : `receipt-${receiptId}`;
  }

  async downloadReceipt(receiptId: string): Promise<void> {
    try {
      const response = await receiptsApi.getPdf(receiptId);
      const blob = new Blob([response.data], { type: "application/pdf" });
      downloadPdf(blob, `${await this.documentFileStem(receiptId)}.pdf`);
      notificationService.success(i18n.t("receipts.downloaded"));
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
      notificationService.success(i18n.t("receipts.generateStarted"));
    } catch (error) {
      const apiError = parseApiError(error);
      console.error("Error generating receipt:", apiError);
      notificationService.error(apiError.message);
    }
  }

  /**
   * Starts generation again for a failed document of the given type. The waybill
   * keeps its own endpoint; an empty `details` makes the server repeat the
   * frozen candidate of the failed attempt.
   */
  async retryDocument(orderId: string, type: DocumentType): Promise<void> {
    if (type === "waybill") return this.generateReceipt(orderId);
    try {
      await receiptsApi.createDocument(orderId, retryBody(type));
      notificationService.success(i18n.t("receipts.generateStarted"));
    } catch (error) {
      const apiError = parseApiError(error);
      console.error(`Error retrying ${type}:`, apiError);
      notificationService.error(apiError.message);
    }
  }

  async handlePrintReceipt(receiptId: string): Promise<void> {
    if (this.availablePrinters.length > 1) {
      const printer = prompt(
        i18n.t("receipts.printerPrompt", {
          printers: this.availablePrinters.join(", "),
        }),
      );
      await this.printReceipt(receiptId, printer || undefined);
    } else {
      await this.printReceipt(receiptId);
    }
  }
}

// Singleton instance
export const receiptService = new ReceiptService();
