import * as React from "react";
import { cn } from "./cn";

/* ------------------------------------------------------------------ */
/*  Tabs (root)                                                        */
/* ------------------------------------------------------------------ */

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
}

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  instanceId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx)
    throw new Error("Tabs compound components must be used within <Tabs>");
  return ctx;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ value, onValueChange, className, children, ...props }, ref) => {
    const instanceId = React.useId();
    return (
      <TabsContext.Provider value={{ value, onValueChange, instanceId }}>
        <div ref={ref} className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = "Tabs";

/* ------------------------------------------------------------------ */
/*  TabsList                                                           */
/* ------------------------------------------------------------------ */

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { onValueChange } = useTabsContext();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute("role") !== "tab") return;

    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        '[role="tab"]:not([disabled])',
      ),
    );
    const index = tabs.indexOf(target);
    if (index === -1) return;

    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;

    if (next !== -1) {
      e.preventDefault();
      const nextTab = tabs[next];
      nextTab.focus();
      const nextValue = nextTab.getAttribute("data-value");
      if (nextValue) onValueChange(nextValue);
    }
  };

  return (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-[var(--radius,10px)] bg-[var(--color-surface-alt)] p-1 text-[var(--color-text-secondary)]",
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </div>
  );
});
TabsList.displayName = "TabsList";

/* ------------------------------------------------------------------ */
/*  TabsTrigger                                                        */
/* ------------------------------------------------------------------ */

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const { value: selected, onValueChange, instanceId } = useTabsContext();
    const isActive = selected === value;

    return (
      <button
        ref={ref}
        role="tab"
        type="button"
        id={`tab-${instanceId}-${value}`}
        aria-selected={isActive}
        aria-controls={`panel-${instanceId}-${value}`}
        tabIndex={isActive ? 0 : -1}
        data-state={isActive ? "active" : "inactive"}
        data-value={value}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-[calc(var(--radius,10px)-2px)] px-3 py-1.5 text-sm font-medium ring-offset-[var(--color-surface)] transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          isActive &&
            "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm",
          className,
        )}
        onClick={() => onValueChange(value)}
        {...props}
      />
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

/* ------------------------------------------------------------------ */
/*  TabsContent                                                        */
/* ------------------------------------------------------------------ */

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const { value: selected, instanceId } = useTabsContext();
    const isActive = selected === value;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`panel-${instanceId}-${value}`}
        aria-labelledby={`tab-${instanceId}-${value}`}
        tabIndex={0}
        hidden={!isActive}
        className={cn(
          "mt-2 ring-offset-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
          className,
        )}
        {...props}
      />
    );
  },
);
TabsContent.displayName = "TabsContent";

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsProps,
  type TabsTriggerProps,
  type TabsContentProps,
};
