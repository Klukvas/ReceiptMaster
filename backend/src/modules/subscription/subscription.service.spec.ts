import { SubscriptionService } from "./subscription.service";
import {
  PlanName,
  UserSubscription,
} from "./entities/user-subscription.entity";
import { Product } from "../products/entities/product.entity";
import { Recipient } from "../recipients/entities/recipient.entity";
import { PLAN_LIMITS } from "./config/plans.config";

const USER_ID = "user-1";

const subscriptionRow = (plan: PlanName): Partial<UserSubscription> => ({
  id: "sub-1",
  user_id: USER_ID,
  plan,
  creem_status: null,
  creem_subscription_id: null,
  creem_customer_id: null,
  current_period_end: null,
});

/** A manager as the service sees it inside a caller's transaction. */
function txManager(plan: PlanName | null, counted = 0) {
  const orderQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(counted),
  };
  return {
    query: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(plan ? subscriptionRow(plan) : null),
    count: jest.fn().mockResolvedValue(counted),
    createQueryBuilder: jest.fn().mockReturnValue(orderQuery),
    orderQuery,
  };
}

function setup(plan: PlanName | null = "free") {
  const insert = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const subscriptionRepo = {
    findOne: jest.fn().mockResolvedValue(plan ? subscriptionRow(plan) : null),
    findOneOrFail: jest.fn().mockResolvedValue(subscriptionRow(plan ?? "free")),
    createQueryBuilder: jest.fn().mockReturnValue(insert),
  };
  const orderQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(3),
  };
  const dataSource = { manager: txManager(plan, 4) };
  const service = new SubscriptionService(
    subscriptionRepo as never,
    { count: jest.fn().mockResolvedValue(7) } as never,
    { createQueryBuilder: jest.fn().mockReturnValue(orderQuery) } as never,
    dataSource as never,
  );
  return { service, subscriptionRepo, insert, orderQuery, dataSource };
}

describe("SubscriptionService.getStatus", () => {
  it("reports the plan, its limits and the three usage counts", async () => {
    const { service } = setup("pro");

    await expect(service.getStatus(USER_ID)).resolves.toEqual({
      plan: "pro",
      usage: { productsCount: 7, ordersThisMonth: 3, recipientsCount: 4 },
      limits: PLAN_LIMITS.pro,
      billingStatus: null,
      currentPeriodEnd: null,
      hasBillingSubscription: false,
    });
  });

  it("creates a free row for an account that has none: billing links by that row", async () => {
    const { service, subscriptionRepo, insert } = setup(null);

    const status = await service.getStatus(USER_ID);

    expect(status.plan).toBe("free");
    expect(insert.values).toHaveBeenCalledWith({
      user_id: USER_ID,
      plan: "free",
    });
    expect(subscriptionRepo.findOneOrFail).toHaveBeenCalled();
  });

  it("does not count cancelled orders toward the month", async () => {
    const { service, orderQuery } = setup("free");

    await service.getStatus(USER_ID);

    expect(orderQuery.andWhere).toHaveBeenCalledWith(
      "order.status <> :cancelled",
      { cancelled: "cancelled" },
    );
  });
});

describe("SubscriptionService quotas inside a transaction", () => {
  const { service } = setup();

  it.each([
    ["product", "product-quota", "assertCanCreateProductInTx"],
    ["recipient", "recipient-quota", "assertCanCreateRecipientInTx"],
    ["order", "order-monthly-quota", "assertCanCreateOrderInTx"],
  ] as const)(
    "takes the per-user %s lock before it reads the plan",
    async (_name, lockName, method) => {
      const manager = txManager("free", 0);

      await service[method](manager as never, USER_ID);

      expect(manager.query).toHaveBeenCalledWith(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [lockName, USER_ID],
      );
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.findOne.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([
    ["free", 9, 10],
    ["pro", 499, 500],
  ] as const)(
    "allows a product below the %s limit and refuses one at it",
    async (plan, below, limit) => {
      await expect(
        service.assertCanCreateProductInTx(
          txManager(plan, below) as never,
          USER_ID,
        ),
      ).resolves.toBeUndefined();
      await expect(
        service.assertCanCreateProductInTx(
          txManager(plan, limit) as never,
          USER_ID,
        ),
      ).rejects.toMatchObject({
        errorCode: "PRODUCT_LIMIT_EXCEEDED",
        statusCode: 402,
      });
    },
  );

  it("counts products without soft-deleted ones and skips the count where there is no limit", async () => {
    const limited = txManager("free", 0);
    await service.assertCanCreateProductInTx(limited as never, USER_ID);
    expect(limited.count).toHaveBeenCalledWith(Product, {
      where: { user_id: USER_ID },
    });

    const unlimited = txManager("business", 9999);
    await service.assertCanCreateProductInTx(unlimited as never, USER_ID);
    expect(unlimited.count).not.toHaveBeenCalled();
  });

  it.each([
    ["free", 10],
    ["pro", 300],
  ] as const)(
    "refuses a recipient at the %s limit and names the limit",
    async (plan, limit) => {
      const manager = txManager(plan, limit);

      await expect(
        service.assertCanCreateRecipientInTx(manager as never, USER_ID),
      ).rejects.toMatchObject({
        errorCode: "RECIPIENT_LIMIT_EXCEEDED",
        statusCode: 402,
        details: { limit },
      });
      expect(manager.count).toHaveBeenCalledWith(Recipient, {
        where: { user_id: USER_ID },
      });
    },
  );

  it("does not limit recipients on the top plan", async () => {
    const manager = txManager("business", 100_000);

    await expect(
      service.assertCanCreateRecipientInTx(manager as never, USER_ID),
    ).resolves.toBeUndefined();
    expect(manager.count).not.toHaveBeenCalled();
  });

  it.each([
    ["free", 20],
    ["pro", 150],
    ["business", 1500],
  ] as const)(
    "refuses an order at the %s monthly limit of %i",
    async (plan, limit) => {
      await expect(
        service.assertCanCreateOrderInTx(
          txManager(plan, limit - 1) as never,
          USER_ID,
        ),
      ).resolves.toBeUndefined();
      await expect(
        service.assertCanCreateOrderInTx(
          txManager(plan, limit) as never,
          USER_ID,
        ),
      ).rejects.toMatchObject({
        errorCode: "ORDER_MONTHLY_LIMIT_EXCEEDED",
        statusCode: 402,
      });
    },
  );

  it("treats a missing subscription row as free without creating one", async () => {
    const { service: fresh, subscriptionRepo } = setup(null);

    await expect(
      fresh.assertCanCreateProductInTx(txManager(null, 10) as never, USER_ID),
    ).rejects.toMatchObject({ errorCode: "PRODUCT_LIMIT_EXCEEDED" });
    expect(subscriptionRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});

describe("SubscriptionService templates and features", () => {
  it("lists the templates of each plan: one, ten, and all", async () => {
    await expect(
      setup("free").service.getAllowedTemplateIds(USER_ID),
    ).resolves.toEqual(["standard"]);
    await expect(
      setup("pro").service.getAllowedTemplateIds(USER_ID),
    ).resolves.toHaveLength(10);
    await expect(
      setup("business").service.getAllowedTemplateIds(USER_ID),
    ).resolves.toBeNull();
  });

  it.each([
    ["free", "standard", true],
    ["free", "compact", false],
    ["pro", "proforma", true],
    ["pro", "branded", false],
    ["business", "branded", true],
  ] as const)("%s plan, template %s: allowed=%s", async (plan, id, allowed) => {
    const attempt = setup(plan).service.assertCanUseTemplate(USER_ID, id);

    if (allowed) await expect(attempt).resolves.toBeUndefined();
    else
      await expect(attempt).rejects.toMatchObject({
        errorCode: "TEMPLATE_PLAN_RESTRICTED",
        statusCode: 402,
      });
  });

  it("refuses a feature the plan lacks and names it for the client", async () => {
    await expect(
      setup("free").service.assertFeature(USER_ID, "suppliers"),
    ).rejects.toMatchObject({
      errorCode: "PLAN_FEATURE_RESTRICTED",
      statusCode: 402,
      details: { feature: "suppliers" },
    });
    await expect(
      setup("pro").service.assertFeature(USER_ID, "suppliers"),
    ).resolves.toBeUndefined();
  });

  it("reads limits without creating a subscription row", async () => {
    const { service, subscriptionRepo } = setup(null);

    await expect(service.getPlanLimits(USER_ID)).resolves.toBe(
      PLAN_LIMITS.free,
    );
    expect(subscriptionRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
