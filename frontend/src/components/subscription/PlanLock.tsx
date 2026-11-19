import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { clsx } from "clsx";
import { usePlanLockHint, useUpgradePrompt } from "../../hooks/usePlanLock";
import type { UpgradeReason } from "../../lib/plan-catalog";

const SIZE_CLASSES = {
  sm: "gap-1 px-2 py-1 text-xs",
  md: "gap-1.5 px-3 py-2 text-sm min-h-10",
} as const;

/**
 * The locked stand-in for a control the plan does not include: a real button with a lock
 * and the plan that has it, which opens the upgrade dialog for `reason`. `subject` names
 * the locked thing for assistive tech ("Export CSV. Available on Pro").
 */
export const PlanLockButton = ({
  reason,
  subject,
  label,
  size = "md",
  isIconOnly = false,
  className,
  testId,
  onOpen,
}: {
  reason: UpgradeReason;
  subject?: string;
  /** Shown in place of the hint when several locks sit side by side (one per document type). */
  label?: string;
  size?: keyof typeof SIZE_CLASSES;
  /** Only the lock is drawn (a narrow table cell); the hint stays in the name and the tooltip. */
  isIconOnly?: boolean;
  className?: string;
  testId?: string;
  /**
   * Opens the dialog owned by the caller instead of the button's own: for a form with its
   * own focus trap, which has to know that a dialog is open above it.
   */
  onOpen?: (reason: UpgradeReason) => void;
}) => {
  const hint = usePlanLockHint(reason);
  const prompt = useUpgradePrompt();
  const name = subject ? `${subject}. ${hint}` : hint;
  return (
    <>
      <button
        type="button"
        data-plan-lock={reason}
        data-testid={testId}
        aria-label={name}
        title={isIconOnly || label ? name : undefined}
        onClick={(event) => {
          event.stopPropagation();
          (onOpen ?? prompt.open)(reason);
        }}
        className={clsx(
          "inline-flex items-center rounded-lg border border-dashed border-[var(--color-border)] font-medium text-content-secondary hover:bg-surface-alt hover:text-content pointer-coarse:min-h-11",
          SIZE_CLASSES[size],
          className,
        )}
      >
        <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 text-warning-base" />
        {!isIconOnly && <span>{label ?? hint}</span>}
      </button>
      {prompt.modal}
    </>
  );
};

/**
 * A compact locked block that takes the place of a whole widget, section or page:
 * what it is, one line on what the plan would give, and the lock button.
 */
export const PlanLockTile = ({
  reason,
  title,
  description,
  icon,
  className,
  testId,
}: {
  reason: UpgradeReason;
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  testId?: string;
}) => (
  <div
    data-testid={testId}
    className={clsx(
      "flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-elevated p-4",
      className,
    )}
  >
    <div className="flex items-center gap-2 text-sm font-medium text-content">
      {icon}
      {title}
    </div>
    {description && (
      <p className="text-sm text-content-secondary">{description}</p>
    )}
    <PlanLockButton reason={reason} subject={title} size="sm" />
  </div>
);
