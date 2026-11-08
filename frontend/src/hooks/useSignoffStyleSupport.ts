import { useQuery } from "@tanstack/react-query";
import { documentConfigQuery } from "./useDocumentDraft";
import { useDocumentTemplates } from "./useDocumentTemplates";

/**
 * Whether the account's current document style prints the signature and stamp.
 * `isSupported` is null while that is unknown (still loading, or either request failed),
 * so the page never warns on a guess.
 */
export function useSignoffStyleSupport() {
  const config = useQuery(documentConfigQuery);
  const templates = useDocumentTemplates();
  const current = templates.data?.find(
    (template) => template.id === config.data?.config.templateId,
  );
  return {
    isSupported: current ? current.capabilities.signoff : null,
    styleName: current?.name ?? "",
  };
}
