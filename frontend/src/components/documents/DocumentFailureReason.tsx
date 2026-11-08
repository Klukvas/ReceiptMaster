import { failureReasonKey } from "../../lib/failure-reason";
import { useTranslation } from "../../hooks/useTranslation";

/**
 * Why a document failed, in the interface language; the server's English text is never shown as is.
 * Plain text, not an alert: a list of rows announcing every failure at load would drown the page.
 */
export function DocumentFailureReason({
  message,
  nextStepKey,
}: {
  message: string | null;
  /** Translation key of what to do next, for a row that offers no retry button of its own. */
  nextStepKey?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5 text-xs text-danger-base">
      <p data-testid="failure-reason">{t(failureReasonKey(message))}</p>
      {nextStepKey && <p>{t(nextStepKey)}</p>}
    </div>
  );
}
