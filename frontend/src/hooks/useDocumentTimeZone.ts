import { useQuery } from "@tanstack/react-query";
import { resolveDocumentTimeZone } from "../lib/document-clock";
import { documentConfigQuery } from "./useDocumentDraft";

/** The account's document time zone (settings, else Europe/Kyiv): the zone the API cuts days in. */
export function useDocumentTimeZone(): string {
  const config = useQuery(documentConfigQuery);
  return resolveDocumentTimeZone(config.data?.config.formatting.timeZone);
}
