import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, passwordByteLength } from "../../lib/password-policy";
import { useTranslation } from "../../hooks/useTranslation";

type PasswordBytesHintProps = {
  id: string;
  password: string;
  className?: string;
};

/**
 * The new-password rule plus a live byte count: the server limit is 72 UTF-8 bytes, which a
 * character count cannot show (Cyrillic letters take two), so nothing is cut off silently.
 */
export function PasswordBytesHint({ id, password, className = "" }: PasswordBytesHintProps) {
  const { t } = useTranslation();
  const used = passwordByteLength(password);
  const isOver = used > MAX_PASSWORD_BYTES;
  return (
    <p id={id} className={`mt-1 flex justify-between gap-3 text-xs ${className}`}>
      <span>{t("auth.passwordRule", { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES })}</span>
      {password !== "" && (
        <span
          data-testid="password-bytes"
          className={`shrink-0 tabular-nums ${isOver ? "font-medium text-danger-base" : ""}`}
        >
          {t("auth.passwordBytes", { used, max: MAX_PASSWORD_BYTES })}
        </span>
      )}
    </p>
  );
}
