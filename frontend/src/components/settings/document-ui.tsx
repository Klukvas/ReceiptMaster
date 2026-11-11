import { useContext, useId, type ReactNode } from "react";
import { Disclosure } from "../ui/Disclosure";
import { DocumentLayoutContext } from "./document-layout";

export const selectClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm text-content focus:ring-2 focus:ring-[var(--color-ring)]";

/**
 * A group of related settings with one plain line on what it changes on the document: an open
 * card on the settings page, an accordion (closed unless `defaultOpen`) in the per-document dialog.
 */
export const DocumentSection = ({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) => {
  const titleId = useId();
  const layout = useContext(DocumentLayoutContext);
  if (layout === "dialog")
    return (
      <Disclosure summary={title} defaultOpen={defaultOpen}>
        {description && (
          <p className="text-sm text-content-tertiary">{description}</p>
        )}
        {children}
      </Disclosure>
    );
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-4 rounded-xl border border-[var(--color-border)] bg-elevated p-5"
    >
      <div>
        <h3 id={titleId} className="font-semibold text-content">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-sm text-content-tertiary">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
};

/** Small grey explanation under a control. Pass `id` and reference it with aria-describedby. */
export const FieldHint = ({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) => (
  <p id={id} className="mt-1 text-xs text-content-tertiary">
    {children}
  </p>
);

/** A select or text control with its label and an optional hint, wired for screen readers. */
export const LabelledField = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => ReactNode;
}) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-content-secondary"
      >
        {label}
      </label>
      {children({ id, "aria-describedby": hintId })}
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
    </div>
  );
};

export const CheckField = ({
  label,
  ariaLabel,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  /** When the visible label repeats (e.g. "Show on document" under every field), a full name for screen readers. */
  ariaLabel?: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      {/* The whole row is the hit area; a thumb needs 44px of it. */}
      <label className="flex items-start gap-2 text-sm text-content pointer-coarse:min-h-11 pointer-coarse:items-center">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 pointer-coarse:mt-0"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
    </div>
  );
};
