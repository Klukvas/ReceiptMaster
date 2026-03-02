import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../lib/api";

export interface ReceiptDesignSettings {
  receiptTitle: string;
  templateId: string;
  templateLanguage: string;
  footerTitle: string;
  footerSubtitle: string;
  primaryColor: string;
  paymentTerms: string;
  deliveryTerms: string;
}

export const RECEIPT_DESIGN_QUERY_KEY = ["settings", "receipt-design"] as const;

export const useReceiptDesignSettings = () => {
  return useQuery<ReceiptDesignSettings>({
    queryKey: RECEIPT_DESIGN_QUERY_KEY,
    queryFn: async () => {
      const res = await settingsApi.getReceiptDesign();
      const payload = res?.data;
      const normalized =
        payload && typeof payload === "object" && "data" in payload
          ? (payload as Record<string, unknown>).data
          : payload;
      return normalized as ReceiptDesignSettings;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
};
