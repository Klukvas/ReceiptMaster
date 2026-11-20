export const CHECKBOX_CLASS =
  "rounded border-[var(--color-border)] text-accent-base focus:ring-[var(--color-ring)]";

/** What a phone card needs to draw its own selection checkbox; absent when the list is not selectable. */
export interface CardSelection {
  isSelected: boolean;
  onToggle: () => void;
  label: string;
}

interface CardSelectCheckboxProps {
  selection: CardSelection;
}

/**
 * Sits in the card's first header slot. The tap box is 44 px, but negative margins keep it from
 * pushing the card's content, so the card is as wide as one without selection.
 */
export function CardSelectCheckbox({ selection }: CardSelectCheckboxProps) {
  return (
    <label className="-my-3 -ml-3 -mr-1 flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={selection.isSelected}
        onChange={selection.onToggle}
        aria-label={selection.label}
        className={`${CHECKBOX_CLASS} size-5`}
      />
    </label>
  );
}
