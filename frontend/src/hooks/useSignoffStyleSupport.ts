import { useQuery } from "@tanstack/react-query";
import { documentConfigQuery } from "./useDocumentDraft";
import { useDocumentTemplates } from "./useDocumentTemplates";
import { useTranslation } from "./useTranslation";
import { templateDisplayName } from "../lib/template-name";

/**
 * Whether the account's current document style prints the signature and stamp, and which styles do.
 * `isSupported` is null while that is unknown (still loading, or either request failed),
 * so the page never warns on a guess; `supportingStyles` is null until the styles have loaded.
 */
export function useSignoffStyleSupport() {
  const config = useQuery(documentConfigQuery);
  const { t } = useTranslation();
  const templates = useDocumentTemplates();
  const current = templates.data?.find(
    (template) => template.id === config.data?.config.templateId,
  );
  const supportingStyles = templates.data
    ?.filter((template) => template.capabilities.signoff)
    .map((template) => templateDisplayName(t, template));
  return {
    isSupported: current ? current.capabilities.signoff : null,
    styleName: current ? templateDisplayName(t, current) : "",
    supportingStyles: supportingStyles && supportingStyles.length > 0 ? supportingStyles : null,
  };
}
