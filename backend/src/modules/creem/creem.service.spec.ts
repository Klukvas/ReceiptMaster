import { createHmac } from "crypto";
import { CreemService } from "./creem.service";
import { CreemClient } from "./creem.client";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";

const USER_ID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const USER_EMAIL = "test@example.com";
const WEBHOOK_SECRET = "whsec_test";
const PRO_PRODUCT = "prod_pro_123";
const BUSINESS_PRODUCT = "prod_biz_456";
const PERIOD_END = "2026-12-18T10:00:00.000Z";
const EVENT_AT = Date.parse("2026-11-18T10:00:00.000Z");
const MINUTE = 60_000;

type ConfigValues = Record<string, string | boolean | undefined>;

const makeSubscription = (
  overrides: Partial<UserSubscription> = {},
): UserSubscription =>
  ({
    id: "row-1",
    user_id: USER_ID,
    plan: "free",
    creem_customer_id: null,
    creem_subscription_id: null,
    creem_status: null,
    creem_event_at: null,
    current_period_end: null,
    ...overrides,
  }) as UserSubscription;

const linked = (overrides: Partial<UserSubscription> = {}) =>
  makeSubscription({
    plan: "pro",
    creem_customer_id: "cust_1",
    creem_subscription_id: "sub_1",
    creem_status: "active",
    creem_event_at: new Date(EVENT_AT - MINUTE),
    current_period_end: new Date("2026-11-18T10:00:00.000Z"),
    ...overrides,
  });

function setup(configOverrides: ConfigValues = {}, isConfigured = true) {
  const config: ConfigValues = {
    BILLING_ENABLED: true,
    CREEM_API_KEY: "creem_test_key",
    CREEM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CREEM_ENVIRONMENT: "test",
    CREEM_PRO_PRODUCT_ID: PRO_PRODUCT,
    CREEM_BUSINESS_PRODUCT_ID: BUSINESS_PRODUCT,
    FRONTEND_URL: "https://app.example.test",
    ...configOverrides,
  };
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const repository = {
    findOne: jest.fn().mockResolvedValue(makeSubscription()),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const client = {
    isConfigured: jest.fn().mockReturnValue(isConfigured),
    createCheckout: jest
      .fn()
      .mockResolvedValue("https://checkout.creem.io/ch_1"),
    createPortalLink: jest
      .fn()
      .mockResolvedValue("https://creem.io/my-orders/login/abc"),
  };
  const service = new CreemService(
    {
      get: (key: string, fallback?: unknown) => config[key] ?? fallback,
    } as never,
    repository as never,
    client as unknown as CreemClient,
  );
  return { service, repository, client, queryBuilder };
}

const subscriptionPayload = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_1",
  status: "active",
  product: { id: PRO_PRODUCT, name: "Pro" },
  customer: { id: "cust_1", email: USER_EMAIL },
  current_period_end_date: PERIOD_END,
  metadata: { userId: USER_ID },
  ...overrides,
});

const event = (
  eventType: string,
  object: unknown,
  createdAt: number | undefined = EVENT_AT,
) => ({ id: "evt_1", eventType, created_at: createdAt, object });

describe("CreemService checkout", () => {
  it("creates a hosted checkout for the plan's product and returns its URL", async () => {
    const { service, client } = setup();

    await expect(
      service.createCheckout(USER_ID, USER_EMAIL, "business"),
    ).resolves.toEqual({ checkoutUrl: "https://checkout.creem.io/ch_1" });
    expect(client.createCheckout).toHaveBeenCalledWith({
      productId: BUSINESS_PRODUCT,
      userId: USER_ID,
      customerEmail: USER_EMAIL,
      successUrl: "https://app.example.test/settings?tab=subscription",
    });
  });

  it.each(["active", "trialing", "past_due", "scheduled_cancel", "paused"])(
    "rejects a second checkout while the subscription is %s",
    async (status) => {
      const { service, repository, client } = setup();
      repository.findOne.mockResolvedValue(
        linked({ creem_status: status as UserSubscription["creem_status"] }),
      );

      await expect(
        service.createCheckout(USER_ID, USER_EMAIL, "pro"),
      ).rejects.toMatchObject({
        errorCode: "SUBSCRIPTION_ALREADY_EXISTS",
        statusCode: 400,
      });
      expect(client.createCheckout).not.toHaveBeenCalled();
    },
  );

  it("allows a new checkout after the previous subscription was canceled", async () => {
    const { service, repository, client } = setup();
    repository.findOne.mockResolvedValue(linked({ creem_status: "canceled" }));

    await service.createCheckout(USER_ID, USER_EMAIL, "pro");
    expect(client.createCheckout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the API key", () => setup({}, false)],
    ["the plan's product", () => setup({ CREEM_PRO_PRODUCT_ID: undefined })],
  ])(
    "answers 503 without naming the gap when %s is not configured",
    async (_name, build) => {
      const failure = await build()
        .service.createCheckout(USER_ID, USER_EMAIL, "pro")
        .catch((error: unknown) => error);

      expect(failure).toMatchObject({
        errorCode: "BILLING_UNAVAILABLE",
        statusCode: 503,
        error: "Payments are currently unavailable",
      });
    },
  );
});

describe("CreemService portal", () => {
  it("returns the portal link of the user's Creem customer", async () => {
    const { service, repository, client } = setup();
    repository.findOne.mockResolvedValue(linked());

    await expect(service.createPortalSession(USER_ID)).resolves.toEqual({
      url: "https://creem.io/my-orders/login/abc",
    });
    expect(client.createPortalLink).toHaveBeenCalledWith("cust_1");
  });

  it("rejects a user without a Creem subscription", async () => {
    const { service, client } = setup();

    await expect(service.createPortalSession(USER_ID)).rejects.toMatchObject({
      errorCode: "SUBSCRIPTION_NOT_FOUND",
    });
    expect(client.createPortalLink).not.toHaveBeenCalled();
  });
});

describe("CreemService webhook verification", () => {
  const body = JSON.stringify(event("subscription.paid", { id: "sub_1" }));
  const sign = (payload: string, secret = WEBHOOK_SECRET) =>
    createHmac("sha256", secret).update(payload).digest("hex");
  const failureOf = (run: () => unknown): unknown => {
    try {
      return run();
    } catch (error) {
      return error;
    }
  };

  it("returns the event for a body signed with the webhook secret", () => {
    expect(setup().service.verifyWebhook(body, sign(body))).toMatchObject({
      id: "evt_1",
      eventType: "subscription.paid",
      created_at: EVENT_AT,
    });
  });

  it.each([
    ["a signature made with another secret", sign(body, "whsec_other")],
    ["a signature of another body", sign(`${body} `)],
    ["a malformed signature", "not-hex"],
    ["an empty signature", ""],
  ])("rejects %s with 400", (_name, signature) => {
    expect(
      failureOf(() => setup().service.verifyWebhook(body, signature)),
    ).toMatchObject({
      errorCode: "WEBHOOK_SIGNATURE_INVALID",
      statusCode: 400,
    });
  });

  it.each([
    ["JSON without the envelope fields", JSON.stringify({ hello: "world" })],
    ["a body that is not JSON", "not json"],
  ])("rejects correctly signed %s with 400", (_name, payload) => {
    expect(
      failureOf(() => setup().service.verifyWebhook(payload, sign(payload))),
    ).toMatchObject({ errorCode: "WEBHOOK_PAYLOAD_INVALID", statusCode: 400 });
  });

  it("answers 503, not a signature error, when the webhook secret is missing", () => {
    const { service } = setup({ CREEM_WEBHOOK_SECRET: undefined });

    expect(
      failureOf(() => service.verifyWebhook(body, sign(body))),
    ).toMatchObject({ errorCode: "BILLING_UNAVAILABLE", statusCode: 503 });
  });
});

describe("CreemService activation events", () => {
  it.each(["subscription.active", "subscription.paid"])(
    "%s links the subscription to the user from the checkout metadata",
    async (eventType) => {
      const { service, repository } = setup();

      await service.handleWebhookEvent(event(eventType, subscriptionPayload()));

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { user_id: USER_ID },
      });
      expect(repository.update).toHaveBeenCalledWith(
        { id: "row-1" },
        {
          creem_customer_id: "cust_1",
          creem_subscription_id: "sub_1",
          creem_status: "active",
          plan: "pro",
          current_period_end: new Date(PERIOD_END),
          creem_event_at: new Date(EVENT_AT),
        },
      );
    },
  );

  it("resolves the business plan and keeps a trial marked as trialing", async () => {
    const { service, repository } = setup();

    await service.handleWebhookEvent(
      event(
        "subscription.trialing",
        subscriptionPayload({
          status: "trialing",
          product: { id: BUSINESS_PRODUCT },
        }),
      ),
    );

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({ plan: "business", creem_status: "trialing" }),
    );
  });

  it.each([
    ["is absent", undefined],
    ["is not a UUID", { userId: "not-a-uuid" }],
    ["carries an injection attempt", { userId: "'; DROP TABLE users; --" }],
    ["is not a string", { userId: 42 }],
  ])(
    "matches by subscription id when the metadata userId %s",
    async (_name, metadata) => {
      const { service, repository } = setup();
      repository.findOne.mockResolvedValue(linked());

      await service.handleWebhookEvent(
        event("subscription.paid", subscriptionPayload({ metadata })),
      );

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { creem_subscription_id: "sub_1" },
      });
      expect(repository.update).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the stored period end when a renewal of the same subscription carries none", async () => {
    const { service, repository } = setup();
    const existing = linked();
    repository.findOne.mockResolvedValue(existing);

    await service.handleWebhookEvent(
      event(
        "subscription.paid",
        subscriptionPayload({
          current_period_end_date: null,
          customer: undefined,
        }),
      ),
    );

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({
        current_period_end: existing.current_period_end,
        creem_customer_id: "cust_1",
      }),
    );
  });

  it("does not carry the old period end over to a different subscription", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(linked({ creem_status: "canceled" }));

    await service.handleWebhookEvent(
      event(
        "subscription.paid",
        subscriptionPayload({ id: "sub_2", current_period_end_date: null }),
      ),
    );

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({
        creem_subscription_id: "sub_2",
        current_period_end: null,
      }),
    );
  });

  it("grants nothing for a product this app does not sell", async () => {
    const { service, repository } = setup();

    await service.handleWebhookEvent(
      event(
        "subscription.paid",
        subscriptionPayload({ product: { id: "prod_other" } }),
      ),
    );

    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("does not throw when the user has no subscription row", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.handleWebhookEvent(
        event("subscription.paid", subscriptionPayload()),
      ),
    ).resolves.toBeUndefined();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("checkout.completed activates from the nested subscription with id references", async () => {
    const { service, repository } = setup();

    await service.handleWebhookEvent(
      event("checkout.completed", {
        id: "ch_1",
        product: { id: BUSINESS_PRODUCT },
        customer: { id: "cust_9" },
        metadata: { userId: USER_ID },
        subscription: {
          id: "sub_9",
          status: "active",
          product: BUSINESS_PRODUCT,
          customer: "cust_9",
          current_period_end_date: PERIOD_END,
        },
      }),
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { user_id: USER_ID },
    });
    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({
        creem_customer_id: "cust_9",
        creem_subscription_id: "sub_9",
        plan: "business",
      }),
    );
  });

  it("checkout.completed falls back to the checkout metadata when the subscription's is empty", async () => {
    const { service, repository } = setup();

    await service.handleWebhookEvent(
      event("checkout.completed", {
        id: "ch_1",
        metadata: { userId: USER_ID },
        subscription: { ...subscriptionPayload(), metadata: {} },
      }),
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { user_id: USER_ID },
    });
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it("checkout.completed for a one-time purchase changes nothing", async () => {
    const { service, repository } = setup();

    await service.handleWebhookEvent(
      event("checkout.completed", {
        id: "ch_2",
        product: { id: PRO_PRODUCT },
        metadata: { userId: USER_ID },
      }),
    );

    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe("CreemService late and replayed events", () => {
  it("a payment retried after the cancellation does not revive the subscription", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(
      linked({ creem_status: "canceled", creem_event_at: new Date(EVENT_AT) }),
    );

    await service.handleWebhookEvent(
      event("subscription.paid", subscriptionPayload(), EVENT_AT - MINUTE),
    );

    expect(repository.update).not.toHaveBeenCalled();
  });

  it("an old subscription's event does not take the row back from a newer purchase", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(
      linked({
        creem_subscription_id: "sub_new",
        creem_event_at: new Date(EVENT_AT),
      }),
    );

    await service.handleWebhookEvent(
      event(
        "checkout.completed",
        { id: "ch_old", subscription: subscriptionPayload({ id: "sub_old" }) },
        EVENT_AT - MINUTE,
      ),
    );

    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each(["subscription.update", "subscription.canceled"])(
    "%s older than the applied state is ignored",
    async (eventType) => {
      const { service, repository } = setup();
      repository.findOne.mockResolvedValue(
        linked({ creem_event_at: new Date(EVENT_AT) }),
      );

      await service.handleWebhookEvent(
        event(eventType, subscriptionPayload(), EVENT_AT - MINUTE),
      );

      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it("a redelivery of the last applied event is applied again (same timestamp)", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(
      linked({ creem_event_at: new Date(EVENT_AT) }),
    );

    await service.handleWebhookEvent(
      event("subscription.paid", subscriptionPayload()),
    );

    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it("an event without a timestamp is applied and keeps the stored one", async () => {
    const { service, repository } = setup();
    const existing = linked();
    repository.findOne.mockResolvedValue(existing);

    await service.handleWebhookEvent({
      id: "evt_1",
      eventType: "subscription.canceled",
      object: subscriptionPayload(),
    });

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({ creem_event_at: existing.creem_event_at }),
    );
  });
});

describe("CreemService status events", () => {
  it.each([
    ["subscription.scheduled_cancel", "scheduled_cancel"],
    ["subscription.canceled", "canceled"],
    ["subscription.paused", "paused"],
    ["subscription.past_due", "past_due"],
    ["subscription.unpaid", "past_due"],
  ])("%s stores status %s and keeps the plan", async (eventType, status) => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(linked());

    await service.handleWebhookEvent(event(eventType, subscriptionPayload()));

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      {
        creem_status: status,
        current_period_end: new Date(PERIOD_END),
        creem_event_at: new Date(EVENT_AT),
      },
    );
  });

  it("keeps the stored period end when the event carries none", async () => {
    const { service, repository } = setup();
    const existing = linked();
    repository.findOne.mockResolvedValue(existing);

    await service.handleWebhookEvent(
      event(
        "subscription.canceled",
        subscriptionPayload({ current_period_end_date: null }),
      ),
    );

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({
        creem_status: "canceled",
        current_period_end: existing.current_period_end,
      }),
    );
  });

  it("ignores an event for a subscription that is not linked to anyone", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(null);

    await service.handleWebhookEvent(
      event("subscription.canceled", subscriptionPayload({ id: "sub_old" })),
    );

    expect(repository.update).not.toHaveBeenCalled();
  });

  it("subscription.update switches the plan and syncs the status", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(linked());

    await service.handleWebhookEvent(
      event(
        "subscription.update",
        subscriptionPayload({
          product: { id: BUSINESS_PRODUCT },
          status: "scheduled_cancel",
        }),
      ),
    );

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      {
        plan: "business",
        creem_status: "scheduled_cancel",
        current_period_end: new Date(PERIOD_END),
        creem_event_at: new Date(EVENT_AT),
      },
    );
  });

  it("subscription.update keeps the plan and status for unknown values", async () => {
    const { service, repository } = setup();
    repository.findOne.mockResolvedValue(linked());

    await service.handleWebhookEvent(
      event(
        "subscription.update",
        subscriptionPayload({
          product: { id: "prod_other" },
          status: "something_new",
        }),
      ),
    );

    expect(repository.update).toHaveBeenCalledWith(
      { id: "row-1" },
      expect.objectContaining({ plan: "pro", creem_status: "active" }),
    );
  });

  it.each(["subscription.expired", "refund.created", "dispute.created"])(
    "%s is logged without touching subscription data",
    async (eventType) => {
      const { service, repository } = setup();

      await service.handleWebhookEvent(event(eventType, subscriptionPayload()));

      expect(repository.findOne).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it("acknowledges a malformed payload instead of asking Creem to retry it", async () => {
    const { service, repository } = setup();

    await expect(
      service.handleWebhookEvent(event("subscription.canceled", {})),
    ).resolves.toBeUndefined();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("lets a database failure through so Creem retries the event", async () => {
    const { service, repository } = setup();
    repository.findOne.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.handleWebhookEvent(
        event("subscription.canceled", subscriptionPayload()),
      ),
    ).rejects.toThrow("connection lost");
  });
});

describe("CreemService downgrade cron", () => {
  it("moves unbilled subscriptions past their period end to free in one update", async () => {
    const { service, queryBuilder } = setup();
    queryBuilder.execute.mockResolvedValue({ affected: 2 });

    await service.downgradeCanceledSubscriptions();

    // creem_event_at is left in place: it is what rejects a late replay afterwards.
    expect(queryBuilder.set).toHaveBeenCalledWith({
      plan: "free",
      creem_status: null,
      creem_subscription_id: null,
      creem_customer_id: null,
      current_period_end: null,
    });
    expect(queryBuilder.where).toHaveBeenCalledWith(
      "creem_status IN (:...statuses)",
      { statuses: ["canceled", "paused"] },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "(current_period_end IS NULL OR current_period_end < :now)",
      { now: expect.any(Date) },
    );
  });
});

describe("billing disabled", () => {
  it("does not call Creem or touch subscription data through payment entry points", async () => {
    const { service, repository, client } = setup({ BILLING_ENABLED: false });

    for (const operation of [
      async () => service.createCheckout(USER_ID, USER_EMAIL, "pro"),
      async () => service.createPortalSession(USER_ID),
      async () => service.verifyWebhook("{}", "signature"),
      async () =>
        service.handleWebhookEvent(event("subscription.canceled", {})),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        errorCode: "BILLING_DISABLED",
        statusCode: 503,
      });
    }
    await service.downgradeCanceledSubscriptions();

    expect(client.createCheckout).not.toHaveBeenCalled();
    expect(client.createPortalLink).not.toHaveBeenCalled();
    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
