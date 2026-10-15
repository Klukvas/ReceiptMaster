import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../lib/api";
export type { ReceiptDesignSettings } from "../lib/api";
export const RECEIPT_DESIGN_QUERY_KEY = ["settings", "receipt-design"] as const;
export const useReceiptDesignSettings = () =>
  useQuery({
    queryKey: RECEIPT_DESIGN_QUERY_KEY,
    queryFn: async () => (await settingsApi.getReceiptDesign()).data.data,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: false,
  });
