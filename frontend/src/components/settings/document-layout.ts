import { createContext } from "react";

/**
 * "page": the account settings page, every group an open card.
 * "dialog": the per-document dialog, groups are accordions so the few things people change per
 * document are open and the rest (business details, colours, formats) are one click away.
 */
export type DocumentLayout = "page" | "dialog";
export const DocumentLayoutContext = createContext<DocumentLayout>("page");

/**
 * Tag of the section titles. The settings page puts them right under its h1, so h2 there; the
 * other hosts (a dialog or drawer) already have an h2 title, so h3 by default.
 */
export type SectionHeadingTag = "h2" | "h3";
export const SectionHeadingContext = createContext<SectionHeadingTag>("h3");
