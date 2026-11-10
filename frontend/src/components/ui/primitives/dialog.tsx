import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { useBackClosesDialog } from "../../../hooks/useBackClosesDialog";

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

// Dialogs can stack (Order Details with Share Receipt on top). Only the topmost one
// may react to Escape and Tab, otherwise one keypress closes or traps them all.
// The ones underneath are made inert and hidden from assistive technology, so a
// screen reader (and a pointer) only reaches the dialog that is actually in front.
interface OpenDialog {
  element: () => HTMLElement | null;
}
const openDialogStack: OpenDialog[] = [];

const setBackground = (
  entry: OpenDialog | undefined,
  isBackground: boolean,
) => {
  const element = entry?.element();
  if (!element) return;
  if (isBackground) {
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("inert", "");
  } else {
    element.removeAttribute("aria-hidden");
    element.removeAttribute("inert");
  }
};

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
  /**
   * Where focus goes on close when the element that opened the dialog is gone
   * (e.g. a menu item that unmounted with its menu) or was never focusable (a row click).
   */
  returnFocus?: () => HTMLElement | null | undefined;
}

function Dialog({
  open,
  onOpenChange,
  children,
  className,
  returnFocus,
}: DialogProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const returnFocusRef = React.useRef(returnFocus);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const [titleId, setTitleId] = React.useState<string | undefined>(undefined);
  const [descriptionId, setDescriptionId] = React.useState<string | undefined>(
    undefined,
  );

  React.useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    returnFocusRef.current = returnFocus;
  }, [onOpenChange, returnFocus]);

  useBackClosesDialog(open, () => onOpenChangeRef.current(false));

  React.useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;

    // Capture the opener before the dialog below turns inert: a browser may blur its focused
    // control at that moment, and focus could then not be returned to it.
    previousFocusRef.current = document.activeElement as HTMLElement;
    const entry: OpenDialog = { element: () => rootRef.current };
    setBackground(openDialogStack[openDialogStack.length - 1], true);
    openDialogStack.push(entry);
    const isTopmost = () =>
      openDialogStack[openDialogStack.length - 1] === entry;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      if (!dialogRef.current) return;
      // A field marked data-autofocus wins; otherwise the first control that is not the header's
      // Close button, so a form opens on its first field and a screen reader does not start on "Close".
      const preferred =
        dialogRef.current.querySelector<HTMLElement>("[data-autofocus]");
      const focusable = getFocusableElements(dialogRef.current);
      const first =
        focusable.find((el) => !el.hasAttribute("data-dialog-close")) ??
        focusable[0];
      (preferred ?? first ?? dialogRef.current).focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
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
      const wasTopmost = isTopmost();
      const position = openDialogStack.indexOf(entry);
      if (position !== -1) openDialogStack.splice(position, 1);
      // The dialog underneath must stop being inert before focus can go back into it.
      if (wasTopmost)
        setBackground(openDialogStack[openDialogStack.length - 1], false);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const previous = previousFocusRef.current;
      const canRestore =
        previous && previous.isConnected && previous !== document.body;
      (canRestore ? previous : returnFocusRef.current?.())?.focus();
    };
  }, [open]);

  if (!open) return null;

  // Portalled to <body>: inside an animated ancestor (transform/filter) "fixed" would be
  // positioned against that ancestor, and stacked dialogs become siblings that can be made inert.
  return createPortal(
    <DialogContext.Provider
      value={{ titleId, descriptionId, setTitleId, setDescriptionId }}
    >
      <div
        ref={rootRef}
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            // A portal still bubbles through the React tree: without this a backdrop click on a
            // dialog opened from a table row would also trigger that row's onClick.
            e.stopPropagation();
            onOpenChangeRef.current(false);
          }}
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
    </DialogContext.Provider>,
    document.body,
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
