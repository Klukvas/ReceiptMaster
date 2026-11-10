import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  settingsApi,
  type NumberingSetting,
  type NumberingUpdate,
} from "../lib/api";

export const NUMBERING_QUERY_KEY = ["settings", "document-numbering"] as const;

export const useDocumentNumbering = () =>
  useQuery({
    queryKey: NUMBERING_QUERY_KEY,
    queryFn: async () => (await settingsApi.getNumbering()).data.types,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: false,
  });

export const useUpdateDocumentNumbering = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: NumberingSetting["documentType"];
      body: NumberingUpdate;
    }) => (await settingsApi.updateNumbering(input.type, input.body)).data,
    onSuccess: (saved) => {
      queryClient.setQueryData<NumberingSetting[]>(NUMBERING_QUERY_KEY, (previous) =>
        previous?.map((setting) =>
          setting.documentType === saved.documentType ? saved : setting,
        ),
      );
    },
    onError: () => {
      // A refused start number may mean the counter moved; show the current minimum.
      void queryClient.invalidateQueries({ queryKey: NUMBERING_QUERY_KEY });
    },
  });
};
