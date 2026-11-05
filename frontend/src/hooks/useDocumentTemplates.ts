import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { DocumentTemplate } from "../lib/document-config";

/** Every design the backend offers, with what each can carry and whether the plan allows it. */
export const useDocumentTemplates = () =>
  useQuery({
    queryKey: ["document-templates"],
    queryFn: async () =>
      (await api.get<{ data: DocumentTemplate[] }>("/settings/templates")).data
        .data,
    retry: false,
  });
