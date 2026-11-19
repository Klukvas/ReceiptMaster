import { EntityManager } from "typeorm";
import { ApiErrors } from "../../common/errors/ApiError";
import {
  PlanName,
  UserSubscription,
} from "./entities/user-subscription.entity";
import {
  DEFAULT_TEMPLATE_ID,
  PLAN_LIMITS,
  PlanDocumentType,
  PlanFeature,
  PlanLimits,
} from "./config/plans.config";

/**
 * The plan of an account that has no subscription row. Always "free" in the running app;
 * the database test suites raise it so fixtures written before plans gated features keep
 * exercising those features, and lower it again where a suite tests the free limits.
 */
export const planDefaults: { withoutSubscription: PlanName } = {
  withoutSubscription: "free",
};

/**
 * Plan reads for code that already holds an EntityManager (often inside its own
 * transaction). A missing subscription row is the free plan, and no row is created here.
 */
export async function readPlan(
  manager: EntityManager,
  userId: string,
): Promise<PlanName> {
  const subscription = await manager.findOne(UserSubscription, {
    where: { user_id: userId },
  });
  const plan = subscription?.plan;
  return plan && plan in PLAN_LIMITS ? plan : planDefaults.withoutSubscription;
}

export async function readPlanLimits(
  manager: EntityManager,
  userId: string,
): Promise<PlanLimits> {
  return PLAN_LIMITS[await readPlan(manager, userId)];
}

export async function assertPlanFeature(
  manager: EntityManager,
  userId: string,
  feature: PlanFeature,
): Promise<void> {
  const limits = await readPlanLimits(manager, userId);
  if (!limits.features[feature])
    throw ApiErrors.PLAN_FEATURE_RESTRICTED(feature);
}

export function isTemplateAllowed(
  limits: PlanLimits,
  templateId: string,
): boolean {
  return (
    limits.allowedTemplateIds === null ||
    limits.allowedTemplateIds.includes(templateId)
  );
}

/** The template itself when the plan has it, otherwise the one every plan has. */
export function allowedTemplateOrDefault(
  limits: PlanLimits,
  templateId: string,
): string {
  return isTemplateAllowed(limits, templateId)
    ? templateId
    : DEFAULT_TEMPLATE_ID;
}

export function isDocumentTypeAllowed(
  limits: PlanLimits,
  type: PlanDocumentType,
): boolean {
  return (
    limits.allowedDocumentTypes === null ||
    limits.allowedDocumentTypes.includes(type)
  );
}
