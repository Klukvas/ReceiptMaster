import type { DocumentConfig } from "./document-config";

/** The configuration fields the editor's business group edits (the Company details sub-tab). */
const BUSINESS_FIELDS = ["company", "visibility"] as const satisfies readonly (keyof DocumentConfig)[];

export type DraftChanges = {
  readonly isBusinessChanged: boolean;
  readonly isDesignChanged: boolean;
};

const NO_CHANGES: DraftChanges = { isBusinessChanged: false, isDesignChanged: false };

const isBusinessField = (field: string) =>
  (BUSINESS_FIELDS as readonly string[]).includes(field);

const pick = (config: DocumentConfig, keep: (field: string) => boolean) =>
  JSON.stringify(Object.entries(config).filter(([field]) => keep(field)));

/**
 * Which part of the document draft differs from the saved configuration: the business fields
 * (company details, what to show of the seller and customer) or the design (everything else,
 * including a staged logo). A saved set or "Reset design" can change both.
 */
export function draftChanges(
  saved: DocumentConfig | undefined,
  draft: DocumentConfig | undefined,
  isLogoStaged: boolean,
): DraftChanges {
  if (!saved || !draft) return NO_CHANGES;
  const isDesignField = (field: string) => !isBusinessField(field);
  return {
    isBusinessChanged: pick(saved, isBusinessField) !== pick(draft, isBusinessField),
    isDesignChanged:
      isLogoStaged || pick(saved, isDesignField) !== pick(draft, isDesignField),
  };
}
