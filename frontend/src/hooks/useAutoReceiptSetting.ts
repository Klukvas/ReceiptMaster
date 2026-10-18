import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../lib/api";

export const AUTO_RECEIPT_QUERY_KEY = ["settings", "auto-receipt"] as const;

export const useAutoReceiptSetting = () =>
  useQuery({
    queryKey: AUTO_RECEIPT_QUERY_KEY,
    queryFn: async () => (await settingsApi.getAutoReceipt()).data.data.enabled,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: false,
  });

export const useUpdateAutoReceiptSetting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      (await settingsApi.updateAutoReceipt(enabled)).data.data.enabled,
    onSuccess: (enabled) => {
      queryClient.setQueryData(AUTO_RECEIPT_QUERY_KEY, enabled);
    },
  });
};
