import * as React from "react";
import { cn } from "./cn";

/* ------------------------------------------------------------------ */
/*  Dialog Context                                                      */
/* ------------------------------------------------------------------ */

interface DialogContextValue {
  titleId: string | undefined;
  descriptionId: string | undefined;
  setTitleId: (id: string | undefined) => void;
  setDescriptionId: (id: string | undefined) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  return React.useContext(DialogContext);
}

/* ------------------------------------------------------------------ */
/*  Dialog (root)                                                      */
/* ------------------------------------------------------------------ */

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const [titleId, setTitleId] = React.useState<string | undefined>(undefined);
  const [descriptionId, setDescriptionId] = React.useState<string | undefined>(
    undefined,
  );

  React.useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      if (!dialogRef.current) return;
      // Focus the first focusable child, falling back to the container
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogRef.current.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChangeRef.current(false);
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            document.activeElement === dialogRef.current
          ) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            document.activeElement === dialogRef.current
          ) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <DialogContext.Provider
      value={{ titleId, descriptionId, setTitleId, setDescriptionId }}
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => onOpenChangeRef.current(false)}
          aria-hidden="true"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={cn(
            "relative z-50 w-full max-w-lg outline-none",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.closest("[hidden]") && el.offsetParent !== null);
}

/* ------------------------------------------------------------------ */
/*  DialogContent                                                      */
/* ------------------------------------------------------------------ */

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative m-4 rounded-[var(--radius,10px)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg",
      "max-h-[90vh] overflow-y-auto",
      className,
    )}
    {...props}
  >
    {children}
  </div>
));
DialogContent.displayName = "DialogContent";

/* ------------------------------------------------------------------ */
/*  DialogHeader                                                       */
/* ------------------------------------------------------------------ */

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
));
DialogHeader.displayName = "DialogHeader";

/* ------------------------------------------------------------------ */
/*  DialogTitle                                                        */
/* ------------------------------------------------------------------ */

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, id, ...props }, ref) => {
  const ctx = useDialogContext();
  const generatedId = React.useId();
  const titleId = id ?? generatedId;

  React.useEffect(() => {
    ctx?.setTitleId(titleId);
    return () => ctx?.setTitleId(undefined);
  }, [titleId, ctx]);

  return (
    <h2
      ref={ref}
      id={titleId}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-[var(--color-text)]",
        className,
      )}
      {...props}
    />
  );
});
DialogTitle.displayName = "DialogTitle";

/* ------------------------------------------------------------------ */
/*  DialogDescription                                                  */
/* ------------------------------------------------------------------ */

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, id, ...props }, ref) => {
  const ctx = useDialogContext();
  const generatedId = React.useId();
  const descId = id ?? generatedId;

  React.useEffect(() => {
    ctx?.setDescriptionId(descId);
    return () => ctx?.setDescriptionId(undefined);
  }, [descId, ctx]);

  return (
    <p
      ref={ref}
      id={descId}
      className={cn("text-sm text-[var(--color-text-secondary)]", className)}
      {...props}
    />
  );
});
DialogDescription.displayName = "DialogDescription";

/* ------------------------------------------------------------------ */
/*  DialogFooter                                                       */
/* ------------------------------------------------------------------ */

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
));
DialogFooter.displayName = "DialogFooter";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  type DialogProps,
};
