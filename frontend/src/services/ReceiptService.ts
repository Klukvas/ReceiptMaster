import { receiptsApi, type Receipt } from "../lib/api";
import toast from "react-hot-toast";
import i18n from "../lib/i18n";
import { parseApiError } from "../lib/api-errors";
import { downloadPdf } from "../lib/pdf-utils";

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
      toast.error(apiError.message);
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

  async downloadReceipt(receiptId: string): Promise<void> {
    try {
      const response = await receiptsApi.getPdf(receiptId);
      const blob = new Blob([response.data], { type: "application/pdf" });
      downloadPdf(blob, `receipt-${receiptId}.pdf`);
      toast.success(i18n.t("receipts.downloaded"));
    } catch (error) {
      const apiError = parseApiError(error);
      console.error("Error downloading receipt:", apiError);
      toast.error(apiError.message);
    }
  }

  async printReceipt(receiptId: string, printer?: string): Promise<void> {
    try {
      const response = await receiptsApi.print(receiptId, printer);

      if (response.data.success) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      const apiError = parseApiError(error);
      console.error("Error printing receipt:", apiError);
      toast.error(apiError.message);
    }
  }

  /**
   * Starts generation. The PDF renders in the background, so resolving only
   * means the request was accepted; a failed request rejects and the caller
   * decides how to tell the user.
   */
  async generateReceipt(orderId: string): Promise<void> {
    try {
      await receiptsApi.create(orderId);
    } catch (error) {
      console.error("Error generating receipt:", parseApiError(error));
      throw error;
    }
  }

  async handlePrintReceipt(receiptId: string): Promise<void> {
    if (this.availablePrinters.length > 1) {
      const printer = prompt(
        i18n.t("receipts.choosePrinter", {
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
