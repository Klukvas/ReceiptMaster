import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException } from "@nestjs/common";
import { PaddleService } from "./paddle.service";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";

// Mock the Paddle SDK — constructor + instance methods
const mockPaddleInstance = {
  transactions: {
    create: jest.fn(),
  },
  customerPortalSessions: {
    create: jest.fn(),
  },
  webhooks: {
    unmarshal: jest.fn(),
  },
};

jest.mock("@paddle/paddle-node-sdk", () => ({
  Paddle: jest.fn().mockImplementation(() => mockPaddleInstance),
  Environment: { production: "production", sandbox: "sandbox" },
  EventName: {
    SubscriptionCreated: "subscription.created",
    SubscriptionActivated: "subscription.activated",
    SubscriptionUpdated: "subscription.updated",
    SubscriptionCanceled: "subscription.canceled",
    SubscriptionPastDue: "subscription.past_due",
  },
}));

describe("PaddleService", () => {
  let service: PaddleService;
  let subscriptionRepo: any;

  const userId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const userEmail = "test@example.com";

  const makeConfig = (overrides: Record<string, string | undefined> = {}) => {
    const defaults: Record<string, string | undefined> = {
      PADDLE_API_KEY: undefined,
      PADDLE_WEBHOOK_SECRET: "whsec_test",
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_PRO_PRICE_ID: "pri_pro_123",
      PADDLE_BUSINESS_PRICE_ID: "pri_biz_456",
      FRONTEND_URL: "http://localhost:5173",
    };
    const merged = { ...defaults, ...overrides };
    return { get: jest.fn((key: string) => merged[key]) };
  };

  const makeSubscription = (
    overrides: Partial<UserSubscription> = {},
  ): Partial<UserSubscription> => ({
    id: "sub-1",
    user_id: userId,
    plan: "free",
    paddle_customer_id: null,
    paddle_subscription_id: null,
    paddle_status: null,
    current_period_end: null,
    ...overrides,
  });

  const createQueryBuilderMock = () => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  });

  beforeEach(async () => {
    const qbMock = createQueryBuilderMock();

    subscriptionRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      _qb: qbMock,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaddleService,
        {
          provide: ConfigService,
          useValue: makeConfig(),
        },
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: subscriptionRepo,
        },
      ],
    }).compile();

    service = module.get<PaddleService>(PaddleService);
  });

  // ─── assertPaddleConfigured ───

  describe("createCheckoutTransaction", () => {
    it("should throw when Paddle is not configured", async () => {
      await expect(
        service.createCheckoutTransaction(userId, userEmail, "pro"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createPortalSession", () => {
    it("should throw when Paddle is not configured", async () => {
      await expect(service.createPortalSession(userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw when user has no Paddle subscription", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription());

      await expect(service.createPortalSession(userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("verifyWebhook", () => {
    it("should throw when Paddle is not configured", async () => {
      await expect(service.verifyWebhook("body", "sig")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── handleWebhookEvent — subscription.created ───

  describe("handleWebhookEvent — subscription.created", () => {
    it("should update subscription with plan and paddle fields", async () => {
      const event = {
        eventType: "subscription.created",
        data: {
          id: "sub_paddle_123",
          customerId: "ctm_123",
          customData: { userId },
          items: [{ price: { id: "pri_pro_123" } }],
          currentBillingPeriod: { endsAt: "2026-04-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { user_id: userId },
        {
          paddle_customer_id: "ctm_123",
          paddle_subscription_id: "sub_paddle_123",
          paddle_status: "active",
          plan: "pro",
          current_period_end: new Date("2026-04-01T00:00:00Z"),
        },
      );
    });

    it("should resolve business plan from price ID", async () => {
      const event = {
        eventType: "subscription.created",
        data: {
          id: "sub_paddle_456",
          customerId: "ctm_456",
          customData: { userId },
          items: [{ price: { id: "pri_biz_456" } }],
          currentBillingPeriod: { endsAt: "2026-04-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { user_id: userId },
        expect.objectContaining({ plan: "business" }),
      );
    });

    it("should skip if customData.userId is missing", async () => {
      const event = {
        eventType: "subscription.created",
        data: {
          id: "sub_paddle_789",
          customerId: "ctm_789",
          customData: {},
          items: [{ price: { id: "pri_pro_123" } }],
          currentBillingPeriod: null,
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).not.toHaveBeenCalled();
    });

    // C4: UUID validation
    it("should skip if customData.userId is not a valid UUID", async () => {
      const event = {
        eventType: "subscription.created",
        data: {
          id: "sub_paddle_789",
          customerId: "ctm_789",
          customData: { userId: "not-a-uuid" },
          items: [{ price: { id: "pri_pro_123" } }],
          currentBillingPeriod: null,
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).not.toHaveBeenCalled();
    });

    it("should skip if customData.userId contains injection attempt", async () => {
      const event = {
        eventType: "subscription.created",
        data: {
          id: "sub_paddle_789",
          customerId: "ctm_789",
          customData: { userId: "'; DROP TABLE users; --" },
          items: [{ price: { id: "pri_pro_123" } }],
          currentBillingPeriod: null,
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).not.toHaveBeenCalled();
    });

    // C3: affected rows check
    it("should log error when no subscription row exists for userId", async () => {
      subscriptionRepo.update.mockResolvedValue({ affected: 0 });

      const event = {
        eventType: "subscription.created",
        data: {
          id: "sub_paddle_123",
          customerId: "ctm_123",
          customData: { userId },
          items: [{ price: { id: "pri_pro_123" } }],
          currentBillingPeriod: { endsAt: "2026-04-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalled();
      // Should not throw — just logs and returns
    });

    // M1: unknown price ID defaults to "pro"
    it("should default to 'pro' when price ID is unknown", async () => {
      const event = {
        eventType: "subscription.created",
        data: {
          id: "sub_paddle_123",
          customerId: "ctm_123",
          customData: { userId },
          items: [{ price: { id: "pri_unknown_999" } }],
          currentBillingPeriod: { endsAt: "2026-04-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { user_id: userId },
        expect.objectContaining({ plan: "pro" }),
      );
    });

    it("should handle subscription.activated same as subscription.created", async () => {
      const event = {
        eventType: "subscription.activated",
        data: {
          id: "sub_paddle_123",
          customerId: "ctm_123",
          customData: { userId },
          items: [{ price: { id: "pri_pro_123" } }],
          currentBillingPeriod: { endsAt: "2026-04-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { user_id: userId },
        expect.objectContaining({ plan: "pro", paddle_status: "active" }),
      );
    });
  });

  // ─── handleWebhookEvent — subscription.updated ───

  describe("handleWebhookEvent — subscription.updated", () => {
    it("should update plan on price change", async () => {
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({
          paddle_subscription_id: "sub_paddle_123",
          paddle_status: "active",
          plan: "pro",
        }),
      );

      const event = {
        eventType: "subscription.updated",
        data: {
          id: "sub_paddle_123",
          status: "active",
          items: [{ price: { id: "pri_biz_456" } }],
          currentBillingPeriod: { endsAt: "2026-05-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { id: "sub-1" },
        expect.objectContaining({ plan: "business" }),
      );
    });

    it("should keep existing plan when price ID is unknown", async () => {
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({
          paddle_subscription_id: "sub_paddle_123",
          paddle_status: "active",
          plan: "pro",
        }),
      );

      const event = {
        eventType: "subscription.updated",
        data: {
          id: "sub_paddle_123",
          status: "active",
          items: [{ price: { id: "pri_unknown" } }],
          currentBillingPeriod: { endsAt: "2026-05-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { id: "sub-1" },
        expect.objectContaining({ plan: "pro" }),
      );
    });

    it("should skip if subscription not found", async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);

      const event = {
        eventType: "subscription.updated",
        data: {
          id: "sub_unknown",
          status: "active",
          items: [],
          currentBillingPeriod: null,
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─── handleWebhookEvent — subscription.canceled ───

  describe("handleWebhookEvent — subscription.canceled", () => {
    it("should set status to canceled and keep plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({
          paddle_subscription_id: "sub_paddle_123",
          paddle_status: "active",
          plan: "pro",
        }),
      );

      const event = {
        eventType: "subscription.canceled",
        data: {
          id: "sub_paddle_123",
          currentBillingPeriod: { endsAt: "2026-04-01T00:00:00Z" },
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { id: "sub-1" },
        {
          paddle_status: "canceled",
          current_period_end: new Date("2026-04-01T00:00:00Z"),
        },
      );
    });

    it("should skip if subscription not found", async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);

      const event = {
        eventType: "subscription.canceled",
        data: {
          id: "sub_unknown",
          currentBillingPeriod: null,
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).not.toHaveBeenCalled();
    });

    it("should keep existing period_end when webhook has no billing period", async () => {
      const existingEnd = new Date("2026-03-15T00:00:00Z");
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({
          paddle_subscription_id: "sub_paddle_123",
          paddle_status: "active",
          plan: "pro",
          current_period_end: existingEnd,
        }),
      );

      const event = {
        eventType: "subscription.canceled",
        data: {
          id: "sub_paddle_123",
          currentBillingPeriod: null,
        },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { id: "sub-1" },
        {
          paddle_status: "canceled",
          current_period_end: existingEnd,
        },
      );
    });
  });

  // ─── handleWebhookEvent — subscription.past_due ───

  describe("handleWebhookEvent — subscription.past_due", () => {
    it("should set status to past_due", async () => {
      subscriptionRepo.update.mockResolvedValue({ affected: 1 });

      const event = {
        eventType: "subscription.past_due",
        data: { id: "sub_paddle_123" },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { paddle_subscription_id: "sub_paddle_123" },
        { paddle_status: "past_due" },
      );
    });

    it("should log warning when subscription not found for past_due", async () => {
      subscriptionRepo.update.mockResolvedValue({ affected: 0 });

      const event = {
        eventType: "subscription.past_due",
        data: { id: "sub_unknown" },
      };

      await service.handleWebhookEvent(event as any);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        { paddle_subscription_id: "sub_unknown" },
        { paddle_status: "past_due" },
      );
    });
  });

  // ─── handleWebhookEvent — unhandled event type ───

  describe("handleWebhookEvent — unhandled event type", () => {
    it("should not throw on unhandled event types", async () => {
      const event = {
        eventType: "transaction.completed",
        data: { id: "txn_123" },
      };

      await expect(
        service.handleWebhookEvent(event as any),
      ).resolves.toBeUndefined();
    });
  });

  // ─── downgradeCanceledSubscriptions (C5: bulk update) ───

  describe("downgradeCanceledSubscriptions", () => {
    it("should execute bulk update query for expired canceled subscriptions", async () => {
      subscriptionRepo._qb.execute.mockResolvedValue({ affected: 3 });

      await service.downgradeCanceledSubscriptions();

      const qb = subscriptionRepo._qb;
      expect(subscriptionRepo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith(UserSubscription);
      expect(qb.set).toHaveBeenCalledWith({
        plan: "free",
        paddle_status: null,
        paddle_subscription_id: null,
        paddle_customer_id: null,
        current_period_end: null,
      });
      expect(qb.where).toHaveBeenCalledWith("paddle_status = :status", {
        status: "canceled",
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "current_period_end < :now",
        expect.objectContaining({ now: expect.any(Date) }),
      );
    });

    it("should not log when no subscriptions were downgraded", async () => {
      subscriptionRepo._qb.execute.mockResolvedValue({ affected: 0 });

      await service.downgradeCanceledSubscriptions();

      expect(subscriptionRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });
});

// ─── With Paddle SDK configured ───

describe("PaddleService (with Paddle configured)", () => {
  let service: PaddleService;
  let subscriptionRepo: any;

  const userId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const userEmail = "test@example.com";

  const makeConfig = () => ({
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        PADDLE_API_KEY: "test_api_key",
        PADDLE_WEBHOOK_SECRET: "whsec_test",
        PADDLE_ENVIRONMENT: "sandbox",
        PADDLE_PRO_PRICE_ID: "pri_pro_123",
        PADDLE_BUSINESS_PRICE_ID: "pri_biz_456",
        FRONTEND_URL: "http://localhost:5173",
      };
      return config[key];
    }),
  });

  const makeSubscription = (
    overrides: Partial<UserSubscription> = {},
  ): Partial<UserSubscription> => ({
    id: "sub-1",
    user_id: userId,
    plan: "free",
    paddle_customer_id: null,
    paddle_subscription_id: null,
    paddle_status: null,
    current_period_end: null,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    subscriptionRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaddleService,
        { provide: ConfigService, useValue: makeConfig() },
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: subscriptionRepo,
        },
      ],
    }).compile();

    service = module.get<PaddleService>(PaddleService);
  });

  describe("createCheckoutTransaction", () => {
    it("should create transaction and return transactionId", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription());
      mockPaddleInstance.transactions.create.mockResolvedValue({
        id: "txn_abc123",
      });

      const result = await service.createCheckoutTransaction(
        userId,
        userEmail,
        "pro",
      );

      expect(result).toEqual({ transactionId: "txn_abc123" });
      expect(mockPaddleInstance.transactions.create).toHaveBeenCalledWith({
        items: [{ priceId: "pri_pro_123", quantity: 1 }],
        customData: { userId },
        checkout: { url: "http://localhost:5173" },
      });
    });

    it("should use business price ID for business plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription());
      mockPaddleInstance.transactions.create.mockResolvedValue({
        id: "txn_biz123",
      });

      await service.createCheckoutTransaction(userId, userEmail, "business");

      expect(mockPaddleInstance.transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: "pri_biz_456", quantity: 1 }],
        }),
      );
    });

    // H2: Idempotency
    it("should reject if user already has an active subscription", async () => {
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({
          paddle_subscription_id: "sub_existing",
          paddle_status: "active",
        }),
      );

      await expect(
        service.createCheckoutTransaction(userId, userEmail, "pro"),
      ).rejects.toThrow(BadRequestException);

      expect(mockPaddleInstance.transactions.create).not.toHaveBeenCalled();
    });

    it("should allow checkout if existing subscription is canceled", async () => {
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({
          paddle_subscription_id: "sub_old",
          paddle_status: "canceled",
        }),
      );
      mockPaddleInstance.transactions.create.mockResolvedValue({
        id: "txn_new",
      });

      const result = await service.createCheckoutTransaction(
        userId,
        userEmail,
        "pro",
      );

      expect(result).toEqual({ transactionId: "txn_new" });
    });

    it("should allow checkout if user has no subscription yet", async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);
      mockPaddleInstance.transactions.create.mockResolvedValue({
        id: "txn_first",
      });

      const result = await service.createCheckoutTransaction(
        userId,
        userEmail,
        "pro",
      );

      expect(result).toEqual({ transactionId: "txn_first" });
    });
  });

  describe("createPortalSession", () => {
    it("should return portal URL for user with active subscription", async () => {
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({
          paddle_customer_id: "ctm_123",
          paddle_subscription_id: "sub_456",
        }),
      );
      mockPaddleInstance.customerPortalSessions.create.mockResolvedValue({
        urls: {
          general: { overview: "https://portal.paddle.com/session/xyz" },
        },
      });

      const result = await service.createPortalSession(userId);

      expect(result).toEqual({
        url: "https://portal.paddle.com/session/xyz",
      });
      expect(
        mockPaddleInstance.customerPortalSessions.create,
      ).toHaveBeenCalledWith("ctm_123", ["sub_456"]);
    });

    it("should throw when user has no paddle customer ID", async () => {
      subscriptionRepo.findOne.mockResolvedValue(
        makeSubscription({ paddle_subscription_id: "sub_456" }),
      );

      await expect(service.createPortalSession(userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw when user not found", async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);

      await expect(service.createPortalSession(userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("verifyWebhook", () => {
    it("should unmarshal webhook with correct params", async () => {
      const mockEvent = { eventType: "subscription.created", data: {} };
      mockPaddleInstance.webhooks.unmarshal.mockResolvedValue(mockEvent);

      const result = await service.verifyWebhook("raw-body", "sig-header");

      expect(result).toBe(mockEvent);
      expect(mockPaddleInstance.webhooks.unmarshal).toHaveBeenCalledWith(
        "raw-body",
        "whsec_test",
        "sig-header",
      );
    });

    it("should throw when webhook secret is not configured", async () => {
      const configNoSecret = {
        get: jest.fn((key: string) => {
          const config: Record<string, string | undefined> = {
            PADDLE_API_KEY: "test_api_key",
            PADDLE_WEBHOOK_SECRET: undefined,
            PADDLE_ENVIRONMENT: "sandbox",
            PADDLE_PRO_PRICE_ID: "pri_pro_123",
            PADDLE_BUSINESS_PRICE_ID: "pri_biz_456",
            FRONTEND_URL: "http://localhost:5173",
          };
          return config[key];
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaddleService,
          { provide: ConfigService, useValue: configNoSecret },
          {
            provide: getRepositoryToken(UserSubscription),
            useValue: subscriptionRepo,
          },
        ],
      }).compile();

      const svc = module.get<PaddleService>(PaddleService);

      await expect(svc.verifyWebhook("body", "sig")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("getPriceId", () => {
    it("should throw when price ID env var is not configured", async () => {
      // Override config to clear pro price ID
      const configWithMissing = {
        get: jest.fn((key: string) => {
          const config: Record<string, string | undefined> = {
            PADDLE_API_KEY: "test_api_key",
            PADDLE_WEBHOOK_SECRET: "whsec_test",
            PADDLE_ENVIRONMENT: "sandbox",
            PADDLE_PRO_PRICE_ID: undefined,
            PADDLE_BUSINESS_PRICE_ID: "pri_biz_456",
            FRONTEND_URL: "http://localhost:5173",
          };
          return config[key];
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaddleService,
          { provide: ConfigService, useValue: configWithMissing },
          {
            provide: getRepositoryToken(UserSubscription),
            useValue: subscriptionRepo,
          },
        ],
      }).compile();

      const svc = module.get<PaddleService>(PaddleService);
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription());

      await expect(
        svc.createCheckoutTransaction(userId, userEmail, "pro"),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
