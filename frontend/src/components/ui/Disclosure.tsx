import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Rarely needed options, closed until asked for. A native <details>, so keyboard and screen readers work. */
export const Disclosure = ({
  summary,
  children,
  defaultOpen = false,
}: DisclosureProps) => (
  <details
    open={defaultOpen}
    className="group rounded-lg border border-[var(--color-border)]"
  >
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-content hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] [&::-webkit-details-marker]:hidden">
      {summary}
      <ChevronDown
        aria-hidden
        className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-open:rotate-180"
      />
    </summary>
    <div className="space-y-4 px-4 pb-4 pt-2">{children}</div>
  </details>
);
