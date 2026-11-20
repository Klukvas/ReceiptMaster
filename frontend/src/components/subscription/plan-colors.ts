import type { PlanName } from "../../lib/subscriptionApi";

export const PLAN_COLORS: Readonly<
  Record<PlanName, { border: string; bg: string; badge: string }>
> = {
  free: {
    border: "border-[var(--color-border)]",
    bg: "bg-elevated",
    badge: "bg-surface-alt text-content-secondary",
  },
  pro: {
    border: "border-[var(--color-accent-light)]",
    bg: "bg-[var(--color-accent-light)]",
    badge: "bg-[var(--color-accent-light)] text-accent-base",
  },
  business: {
    border: "border-purple-200 dark:border-purple-800",
    bg: "bg-purple-50/30 dark:bg-purple-900/10",
    badge:
      "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  },
};
