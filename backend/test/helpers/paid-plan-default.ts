import { planDefaults } from "../../src/modules/subscription/plan-access";

// These suites create accounts without a subscription row and were written before plans
// gated documents, branding, analytics and suppliers. They exercise those features, so an
// account without a row gets the top plan here. A suite about the free limits sets
// `planDefaults.withoutSubscription = "free"` (or inserts a subscription row) itself.
planDefaults.withoutSubscription = "business";
