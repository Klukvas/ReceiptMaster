import { PLAN_LIMITS } from "../../src/modules/subscription/config/plans.config";
import { planDefaults } from "../../src/modules/subscription/plan-access";

/**
 * For a suite about the free plan's own limits (product, order and recipient quotas): its
 * accounts have no subscription row and must read as free, not as the suites' paid default.
 */
export function useFreePlanWithoutSubscription(): void {
  let previous = planDefaults.withoutSubscription;
  beforeAll(() => {
    previous = planDefaults.withoutSubscription;
    planDefaults.withoutSubscription = "free";
  });
  afterAll(() => {
    planDefaults.withoutSubscription = previous;
  });
}

/**
 * For a suite about document retention: the top plan keeps every document, so nothing is
 * ever retired on it. This gives it the free plan's limit while leaving every document
 * type and template available to the fixtures.
 */
export function useRetentionLimit(limit = 10): void {
  let restore: { restore(): void } | undefined;
  beforeAll(() => {
    restore = jest.replaceProperty(
      PLAN_LIMITS.business,
      "documentsRetainedPerType",
      limit,
    );
  });
  afterAll(() => restore?.restore());
}
