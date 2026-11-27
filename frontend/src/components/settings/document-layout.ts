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

/** The setting groups of the document editor; the settings page shows a few at a time. */
export const DOCUMENT_GROUPS = [
  "business",
  "template",
  "brand",
  "text",
  "format",
  "presets",
] as const;
export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];

/** Sub-tabs of the Documents settings tab, in display order (`?section=` in the URL). */
export const DOCUMENTS_SECTIONS = ["company", "design", "numbering"] as const;
export type DocumentsSection = (typeof DOCUMENTS_SECTIONS)[number];
