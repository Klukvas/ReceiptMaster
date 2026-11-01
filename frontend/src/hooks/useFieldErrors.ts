import { useCallback, useState } from "react";
import type { TFunction } from "i18next";
import { MIN_PASSWORD_LENGTH } from "../lib/password-policy";
import {
  PROBLEM_MESSAGE_KEYS,
  firstInvalidField,
  type AuthField,
  type AuthFieldErrors,
} from "../lib/auth-validation";

/** Inline auth-form errors: set after a failed submit, cleared per field as the user edits it. */
export const useFieldErrors = (t: TFunction) => {
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  const clearField = useCallback((field: AuthField) => {
    setErrors((previous) => {
      if (!previous[field]) return previous;
      const remaining = { ...previous };
      delete remaining[field];
      return remaining;
    });
  }, []);

  /** Shows the problems and moves focus to the first invalid field; true when there were none. */
  const showErrors = useCallback((found: AuthFieldErrors): boolean => {
    setErrors(found);
    const first = firstInvalidField(found);
    if (first) document.getElementById(first)?.focus();
    return !first;
  }, []);

  const messageFor = (field: AuthField): string | undefined => {
    const problem = errors[field];
    return problem
      ? t(PROBLEM_MESSAGE_KEYS[problem], { min: MIN_PASSWORD_LENGTH })
      : undefined;
  };

  return { errors, clearField, showErrors, messageFor };
};
