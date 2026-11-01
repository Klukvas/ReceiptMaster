interface FieldErrorProps {
  id: string;
  message?: string;
}

/** Inline error under a field; pair with aria-invalid and aria-describedby={id} on the input. */
export const FieldError = ({ id, message }: FieldErrorProps) =>
  message ? (
    <p id={id} role="alert" className="mt-1 text-xs text-danger-base">
      {message}
    </p>
  ) : null;
