import toast from "react-hot-toast";
import type { DocumentDraftModel } from "./useDocumentDraft";
import type { RequisitesDraftModel } from "./useRequisitesDraft";
import { useTranslation } from "./useTranslation";

/** What one Save bar saves and discards. */
export type SaveTarget = {
  isDirty: boolean;
  isBusy: boolean;
  save: () => Promise<void>;
  discard: () => void;
};

/** The Save bar of the editor alone: the design draft. */
export const designSaveTarget = (model: DocumentDraftModel): SaveTarget => ({
  isDirty: model.dirty,
  isBusy: model.busy,
  save: async () => {
    await model.save();
  },
  discard: model.discard,
});

/**
 * One Save for Settings > Documents: the design draft and the seller requisites, which the server
 * stores apart. The requisites are checked first, so a malformed value stops the save before
 * anything is sent; `onRequisitesRefused` then brings their fields into view.
 */
export function useDocumentsSave(
  design: DocumentDraftModel,
  requisites: RequisitesDraftModel,
  onRequisitesRefused: () => void,
): SaveTarget {
  const { t } = useTranslation();

  const save = async () => {
    const isDesignPending = design.dirty;
    const isRequisitesPending = requisites.isDirty;
    if (isRequisitesPending && !requisites.validate()) return onRequisitesRefused();
    if (isDesignPending && !(await design.save())) return;
    if (!isRequisitesPending) return;
    if (!(await requisites.save())) return onRequisitesRefused();
    // The design save confirms itself; a save of the requisites alone needs its own word.
    if (!isDesignPending) toast.success(t("document.saved"));
  };

  return {
    isDirty: design.dirty || requisites.isDirty,
    isBusy: design.busy || requisites.isSaving,
    save,
    discard: () => {
      design.discard();
      requisites.discard();
    },
  };
}
