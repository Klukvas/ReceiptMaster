import { CreemService } from "./creem.service";
import { CreemClient } from "./creem.client";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";

const USER_ID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const PRO_PRODUCT = "prod_pro_123";
const BUSINESS_PRODUCT = "prod_biz_456";
const EVENT_AT = new Date("2026-11-18T10:00:00.000Z");
const PERIOD_END = "2026-12-18T10:00:00.000Z";

const linked = (overrides: Partial<UserSubscription> = {}) =>
  ({
    id: "row-1",
    user_id: USER_ID,
    plan: "pro",
    creem_customer_id: "cust_1",
    creem_subscription_id: "sub_1",
    creem_status: "active",
    creem_event_at: EVENT_AT,
    current_period_end: new Date("2026-11-30T10:00:00.000Z"),
    ...overrides,
  }) as UserSubscription;

const answer = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_1",
  status: "active",
  product: { id: PRO_PRODUCT },
  current_period_end_date: PERIOD_END,
  ...overrides,
});

function setup(
  stored: UserSubscription | null = linked(),
  config: Record<string, string | boolean | undefined> = {},
) {
  const values: Record<string, string | boolean | undefined> = {
    BILLING_ENABLED: true,
    CREEM_PRO_PRODUCT_ID: PRO_PRODUCT,
    CREEM_BUSINESS_PRODUCT_ID: BUSINESS_PRODUCT,
    ...config,
  };
  const repository = {
    findOne: jest.fn().mockResolvedValue(stored),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const client = {
    isConfigured: jest.fn().mockReturnValue(true),
    changeSubscriptionProduct: jest.fn().mockResolvedValue(answer()),
    cancelSubscriptionAtPeriodEnd: jest
      .fn()
      .mockResolvedValue(answer({ status: "scheduled_cancel" })),
    resumeSubscription: jest.fn().mockResolvedValue(answer()),
  };
  const service = new CreemService(
    {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as never,
    repository as never,
    client as unknown as CreemClient,
  );
  return { service, repository, client };
}

describe("CreemService plan change", () => {
  it("an upgrade charges the prorated difference at once and stores the new plan", async () => {
    const { service, repository, client } = setup();
    client.changeSubscriptionProduct.mockResolvedValue(
      answer({ product: { id: BUSINESS_PRODUCT } }),
    );

    await service.changePlan(USER_ID, "business");

    expect(client.changeSubscriptionProduct).toHaveBeenCalledWith(
      "sub_1",
      BUSINESS_PRODUCT,
      "proration-charge-immediately",
    );
    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      {
        plan: "business",
        creem_status: "active",
        current_period_end: new Date(PERIOD_END),
        // Left alone so the webhook that follows is not taken for a replay.
        creem_event_at: EVENT_AT,
      },
    );
  });

  it("a downgrade switches without a charge or a credit", async () => {
    const { service, client } = setup(linked({ plan: "business" }));

    await service.changePlan(USER_ID, "pro");

    expect(client.changeSubscriptionProduct).toHaveBeenCalledWith(
      "sub_1",
      PRO_PRODUCT,
      "proration-none",
    );
  });

  it("keeps the stored plan when Creem answers with a product this app does not sell", async () => {
    const { service, repository, client } = setup();
    client.changeSubscriptionProduct.mockResolvedValue(
      answer({ product: "prod_other" }),
    );

    await service.changePlan(USER_ID, "business");

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({ plan: "pro" }),
    );
  });

  it("refuses the plan the subscription is already on", async () => {
    const { service, client } = setup();

    await expect(service.changePlan(USER_ID, "pro")).rejects.toMatchObject({
      errorCode: "SUBSCRIPTION_PLAN_UNCHANGED",
      statusCode: 400,
    });
    expect(client.changeSubscriptionProduct).not.toHaveBeenCalled();
  });

  it.each(["scheduled_cancel", "past_due", "paused", "canceled"] as const)(
    "refuses a %s subscription",
    async (status) => {
      const { service, client } = setup(linked({ creem_status: status }));

      await expect(
        service.changePlan(USER_ID, "business"),
      ).rejects.toMatchObject({
        errorCode: "SUBSCRIPTION_STATE_CONFLICT",
        statusCode: 409,
      });
      expect(client.changeSubscriptionProduct).not.toHaveBeenCalled();
    },
  );

  it("refuses a user who never subscribed", async () => {
    const { service } = setup(
      linked({ creem_subscription_id: null, creem_status: null, plan: "free" }),
    );

    await expect(service.changePlan(USER_ID, "business")).rejects.toMatchObject(
      { errorCode: "SUBSCRIPTION_NOT_FOUND" },
    );
  });

  it("answers 503 when billing is switched off", async () => {
    const { service } = setup(linked(), { BILLING_ENABLED: false });

    await expect(service.changePlan(USER_ID, "business")).rejects.toMatchObject(
      { errorCode: "BILLING_DISABLED" },
    );
  });
});

describe("CreemService cancellation", () => {
  it("schedules the cancellation and keeps the plan for the paid period", async () => {
    const { service, repository, client } = setup();

    await service.cancelSubscription(USER_ID);

    expect(client.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith("sub_1");
    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({
        plan: "pro",
        creem_status: "scheduled_cancel",
      }),
    );
  });

  it("lets a subscription with a failed payment be cancelled", async () => {
    const { service, client } = setup(linked({ creem_status: "past_due" }));

    await service.cancelSubscription(USER_ID);

    expect(client.cancelSubscriptionAtPeriodEnd).toHaveBeenCalled();
  });

  it("refuses a cancellation that is already scheduled", async () => {
    const { service, client } = setup(
      linked({ creem_status: "scheduled_cancel" }),
    );

    await expect(service.cancelSubscription(USER_ID)).rejects.toMatchObject({
      errorCode: "SUBSCRIPTION_STATE_CONFLICT",
    });
    expect(client.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
  });

  it("stores nothing when Creem fails", async () => {
    const { service, repository, client } = setup();
    client.cancelSubscriptionAtPeriodEnd.mockRejectedValue(
      new Error("provider down"),
    );

    await expect(service.cancelSubscription(USER_ID)).rejects.toThrow(
      "provider down",
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe("CreemService resume", () => {
  it("undoes a scheduled cancellation", async () => {
    const { service, repository, client } = setup(
      linked({ creem_status: "scheduled_cancel" }),
    );

    await service.resumeSubscription(USER_ID);

    expect(client.resumeSubscription).toHaveBeenCalledWith("sub_1");
    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({ creem_status: "active" }),
    );
  });

  it("refuses a subscription that is not scheduled for cancellation", async () => {
    const { service, client } = setup();

    await expect(service.resumeSubscription(USER_ID)).rejects.toMatchObject({
      errorCode: "SUBSCRIPTION_STATE_CONFLICT",
    });
    expect(client.resumeSubscription).not.toHaveBeenCalled();
  });
});
