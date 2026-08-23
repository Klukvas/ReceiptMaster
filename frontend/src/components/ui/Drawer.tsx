import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
} from "motion/react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

// Apple "Designing Fluid Interfaces" momentum projection: where a flick lands,
// using exponential scroll-style decay rather than the physics-textbook form.
const projectMomentum = (velocity: number, decelerationRate = 0.998) =>
  ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);

// Dismiss once the *projected* rightward travel passes this — so a quick flick
// throws the panel closed even from a small drag (§6).
const DISMISS_PROJECTION_PX = 160;

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

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    // Project the resting point from release velocity (§5/§6). Past the
    // threshold we dismiss; otherwise the drag constraints spring it home.
    const projected = info.offset.x + projectMomentum(info.velocity.x);
    if (projected > DISMISS_PROJECTION_PX) onClose();
  };

  // Interruptible spring on enter/exit, same path both ways (§7); reduced
  // motion degrades to a plain cross-fade with no slide (§14).
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

  // Drag-to-dismiss only when motion is allowed. Pull right tracks ~1:1 (§2),
  // pull left past the open position rubber-bands (§9). Constraints of 0/0 make
  // a sub-threshold release spring back home on their own.
  const dragProps = reduceMotion
    ? {}
    : {
        drag: "x" as const,
        dragConstraints: { left: 0, right: 0 },
        dragElastic: { left: 0.12, right: 0.9 },
        dragMomentum: false,
        onDragEnd: handleDragEnd,
        whileDrag: { cursor: "grabbing" },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="drawer" className="fixed inset-0 z-50 flex justify-end">
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
            {...dragProps}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-elevated">
              {title && (
                <h2 className="text-lg font-semibold tracking-tight text-content">
                  {title}
                </h2>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-surface-alt text-content-tertiary motion-safe:active:scale-95 transition-transform"
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
