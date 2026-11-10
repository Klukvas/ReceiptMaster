import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyIssueWarnings } from "../lib/issue-warnings";
import { receiptsApi, type DocumentRequestBody, type Receipt } from "../lib/api";

export type CreateDocumentInput = {
  orderId: string;
  body: DocumentRequestBody;
  logo?: File;
};

/** Starts generating a document of any type; the PDF itself renders in the background. */
export const useCreateDocument = () => {
  const queryClient = useQueryClient();

  return useMutation<Receipt, unknown, CreateDocumentInput>({
    mutationFn: async ({ orderId, body, logo }) =>
      (await receiptsApi.createDocument(orderId, body, logo)).data,
    onSuccess: async (receipt) => {
      notifyIssueWarnings(receipt);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
    },
  });
};
