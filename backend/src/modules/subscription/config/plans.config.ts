import { PlanName } from "../entities/user-subscription.entity";

export interface PlanLimits {
  maxProducts: number | null;
  maxOrdersPerMonth: number | null;
  allowedTemplateIds: string[] | null;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxProducts: 10,
    maxOrdersPerMonth: 20,
    allowedTemplateIds: ["standard", "compact", "minimal"],
  },
  pro: {
    maxProducts: 100,
    maxOrdersPerMonth: 500,
    allowedTemplateIds: null,
  },
  business: {
    maxProducts: null,
    maxOrdersPerMonth: null,
    allowedTemplateIds: null,
  },
};
