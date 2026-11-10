import toast from "react-hot-toast";
import i18n from "./i18n";

/**
 * The "Generating document..." toast gives way to the receipt progress panel. On a phone both
 * sit at the bottom: the toast covered the panel's Download button and still said
 * "Generating" after the card said the document was ready.
 */
export const GENERATING_TOAST_ID = "document-generating";

let isProgressPanelVisible = false;

/** Called by the progress panel whenever it starts or stops showing cards. */
export const setProgressPanelVisible = (isVisible: boolean): void => {
  isProgressPanelVisible = isVisible;
  if (isVisible) toast.dismiss(GENERATING_TOAST_ID);
};

/**
 * The PDF renders in the background; say so, otherwise nothing seems to happen. Skipped
 * while the progress panel is up, which already shows the document's progress.
 */
export const showGeneratingToast = (): void => {
  if (isProgressPanelVisible) return;
  toast(i18n.t("receipts.generatingReceipt"), { id: GENERATING_TOAST_ID });
};
