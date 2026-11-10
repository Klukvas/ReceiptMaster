import { EMAIL_SHAPE } from "./field-patterns";
import { MIN_PASSWORD_LENGTH, exceedsPasswordBytes } from "./password-policy";

export type AuthField = "email" | "password" | "confirmPassword";
export type AuthFieldProblem =
  | "required"
  | "invalidEmail"
  | "emailTaken"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordsDoNotMatch";
export type AuthFieldErrors = Partial<Record<AuthField, AuthFieldProblem>>;

// Same order as the form, so the first problem is the one to focus.
const FIELD_ORDER: readonly AuthField[] = [
  "email",
  "password",
  "confirmPassword",
];

export const PROBLEM_MESSAGE_KEYS: Record<AuthFieldProblem, string> = {
  required: "errors.requiredFieldMissing",
  invalidEmail: "errors.invalidEmail",
  emailTaken: "errors.userAlreadyExists",
  passwordTooShort: "errors.passwordTooShort",
  passwordTooLong: "errors.passwordTooLong",
  passwordsDoNotMatch: "errors.passwordsDoNotMatch",
};

const emailProblem = (email: string): AuthFieldProblem | undefined => {
  if (!email.trim()) return "required";
  return EMAIL_SHAPE.test(email.trim()) ? undefined : "invalidEmail";
};

export const validateLogin = (values: {
  email: string;
  password: string;
}): AuthFieldErrors => ({
  ...(emailProblem(values.email) && { email: emailProblem(values.email) }),
  ...(!values.password && { password: "required" as const }),
});

export const validateRegister = (values: {
  email: string;
  password: string;
  confirmPassword: string;
}): AuthFieldErrors => ({
  ...(emailProblem(values.email) && { email: emailProblem(values.email) }),
  ...(!values.password.trim()
    ? { password: "required" as const }
    : values.password.length < MIN_PASSWORD_LENGTH
      ? { password: "passwordTooShort" as const }
      : exceedsPasswordBytes(values.password)
        ? { password: "passwordTooLong" as const }
        : {}),
  ...(values.password !== values.confirmPassword && {
    confirmPassword: "passwordsDoNotMatch" as const,
  }),
});

export const firstInvalidField = (
  errors: AuthFieldErrors,
): AuthField | undefined => FIELD_ORDER.find((field) => errors[field]);
