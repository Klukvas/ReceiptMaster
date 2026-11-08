import { failureReasonKey } from "../../lib/failure-reason";
import { useTranslation } from "../../hooks/useTranslation";

/** Why a document failed, in the interface language; the server's English text is never shown as is. */
export function DocumentFailureReason({ message }: { message: string | null }) {
  const { t } = useTranslation();
  return (
    <p role="alert" className="text-xs text-danger-base" data-testid="failure-reason">
      {t(failureReasonKey(message))}
    </p>
  );
}
