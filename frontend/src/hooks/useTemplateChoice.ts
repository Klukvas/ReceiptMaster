import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GeneratableType } from "../lib/document-types";
import { documentConfigQuery } from "./useDocumentDraft";
import { useDocumentTemplates } from "./useDocumentTemplates";

/**
 * The designs one document type can use (the backend lists them per style in
 * `capabilities.documentTypes`) and the one picked. Designs of a higher plan are
 * returned apart as `lockedOptions`: shown disabled, never selectable.
 * The account's own design is the default when it fits, else the first that does.
 */
export function useTemplateChoice(type: GeneratableType) {
  const templates = useDocumentTemplates();
  const account = useQuery(documentConfigQuery);
  const [chosenId, setChosenId] = useState<string | null>(null);

  const fitting = (templates.data ?? []).filter((template) =>
    template.capabilities.documentTypes.includes(type),
  );
  const options = fitting.filter((template) => !template.locked);
  const lockedOptions = fitting.filter((template) => template.locked);
  const accountId = account.data?.config.templateId;
  const defaultId =
    options.find((option) => option.id === accountId)?.id ??
    options[0]?.id ??
    "";
  const selectedId = options.some((option) => option.id === chosenId)
    ? (chosenId ?? defaultId)
    : defaultId;

  return {
    options,
    lockedOptions,
    selectedId,
    choose: setChosenId,
    isLoading: templates.isLoading,
    hasLoaded: templates.isSuccess,
    isAccountDesignUnfit:
      templates.isSuccess &&
      options.length > 0 &&
      accountId !== undefined &&
      !options.some((option) => option.id === accountId),
  };
}
