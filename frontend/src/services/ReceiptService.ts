import { receiptsApi, type DocumentRequestBody, type Receipt } from "../lib/api";
import { isGeneratableType, type DocumentType, type GeneratableType } from "../lib/document-types";
import { notifyIssueWarnings } from "../lib/issue-warnings";
import { notificationService } from "./NotificationService";
import { parseApiError } from "../lib/api-errors";
import i18n from "../lib/i18n";
import { downloadPdf } from "../lib/pdf-utils";

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

/** The body that repeats a failed document, or null for a type that cannot be repeated blindly. */
function retryBody(type: GeneratableType): DocumentRequestBody | null {
  switch (type) {
    case "waybill":
      return { type };
    case "invoice":
    case "act":
    case "quote":
      return { type, details: {} };
    case "sales_receipt":
    case "packing_list":
      return { type };
    case "return_note":
      // An order has several return notes: an empty retry would not say which lines to take back.
      return null;
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
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
      notifyIssueWarnings((await receiptsApi.create(orderId)).data);
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
    // A type the server cannot generate must never be retried as some other document.
    if (!isGeneratableType(type)) return;
    const body = retryBody(type);
    if (!body) return;
    try {
      notifyIssueWarnings((await receiptsApi.createDocument(orderId, body)).data);
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
