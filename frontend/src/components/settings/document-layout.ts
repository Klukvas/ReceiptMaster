import { createContext } from "react";

/**
 * "page": the account settings page, every group an open card.
 * "dialog": the per-document dialog, groups are accordions so the few things people change per
 * document are open and the rest (business details, colours, formats) are one click away.
 */
export type DocumentLayout = "page" | "dialog";
export const DocumentLayoutContext = createContext<DocumentLayout>("page");
