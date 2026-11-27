/**
 * The confirm question each settings form asks before its unsaved edits are lost. They also name
 * the form in `useDirtyFormKeys`, so the Documents sub-tabs can tell which hidden form is dirty.
 */
export const UNSAVED_FORM_KEYS = {
  design: "document.discardConfirm",
  requisites: "settings.requisites.discardConfirm",
  numbering: "numbering.discardConfirm",
} as const;
