import toast from "react-hot-toast";
import { receiptsApi, type DocumentRequestBody, type Receipt } from "../lib/api";
import {
  isGeneratableType,
  type DocumentType,
  type GeneratableType,
} from "../lib/document-types";
import { notifyIssueWarnings } from "../lib/issue-warnings";
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
      notifyIssueWarnings((await receiptsApi.create(orderId)).data);
    } catch (error) {
      console.error("Error generating receipt:", parseApiError(error));
      throw error;
    }
  }

  /**
   * Starts generation again for a failed document of the given type. The waybill
   * keeps its own endpoint; an empty `details` makes the server repeat the
   * frozen candidate of the failed attempt. Like `generateReceipt`, a refused
   * request rejects and the caller tells the user.
   */
  async retryDocument(orderId: string, type: DocumentType): Promise<boolean> {
    if (type === "waybill") {
      await this.generateReceipt(orderId);
      return true;
    }
    // A type the server cannot generate must never be retried as some other document.
    if (!isGeneratableType(type)) return false;
    const body = retryBody(type);
    if (!body) return false;
    try {
      notifyIssueWarnings((await receiptsApi.createDocument(orderId, body)).data);
      return true;
    } catch (error) {
      console.error(`Error retrying ${type}:`, parseApiError(error));
      throw error;
    }
  }

  /** `retryDocument` for a button: says that the document is being made, or why it was refused. */
  async retryDocumentWithFeedback(
    orderId: string,
    type: DocumentType,
  ): Promise<void> {
    try {
      if (await this.retryDocument(orderId, type))
        // The PDF renders in the background; say so, otherwise nothing seems to happen.
        toast(i18n.t("receipts.generatingReceipt"));
    } catch (error) {
      toast.error(parseApiError(error).message);
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
