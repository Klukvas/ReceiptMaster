import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export const Drawer = ({ open, onClose, title, children }: DrawerProps) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Apple sheet feel: an interruptible spring (grab-and-reverse mid-flight),
  // entering and exiting along the same path (§7). Under reduced motion it
  // degrades to a plain cross-fade with no slide or overshoot (§14).
  const panelMotion = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.2 },
      }
    : {
        initial: { x: "100%" },
        animate: { x: 0 },
        exit: { x: "100%" },
        transition: { type: "spring" as const, bounce: 0.2, duration: 0.35 },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="drawer"
          className="fixed inset-0 z-50 flex justify-end"
        >
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="relative w-full max-w-md bg-elevated shadow-xl overflow-y-auto"
            {...panelMotion}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-elevated">
              {title && (
                <h2 className="text-lg font-semibold tracking-tight text-content">
                  {title}
                </h2>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-surface-alt text-content-tertiary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
