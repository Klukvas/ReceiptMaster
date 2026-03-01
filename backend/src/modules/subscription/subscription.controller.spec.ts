import { SubscriptionController } from "./subscription.controller";
import { User } from "../users/entities/user.entity";
import { PLAN_LIMITS } from "./config/plans.config";

describe("SubscriptionController", () => {
  let controller: SubscriptionController;
  let subscriptionService: any;
  let paddleService: any;
  const mockUser = { id: "user-1", email: "test@example.com" } as User;
  const mockReq = { user: mockUser };

  beforeEach(() => {
    subscriptionService = {
      getStatus: jest.fn().mockResolvedValue({
        plan: "free",
        usage: { productsCount: 3, ordersThisMonth: 5 },
        limits: PLAN_LIMITS.free,
        paddleStatus: null,
        currentPeriodEnd: null,
        hasPaddleSubscription: false,
      }),
    };

    paddleService = {
      createCheckoutTransaction: jest
        .fn()
        .mockResolvedValue({ transactionId: "txn_123" }),
      createPortalSession: jest
        .fn()
        .mockResolvedValue({ url: "https://portal.paddle.com/session" }),
    };

    controller = new SubscriptionController(subscriptionService, paddleService);
  });

  describe("getStatus", () => {
    it("should return subscription status for user", async () => {
      const result = await controller.getStatus(mockReq);

      expect(subscriptionService.getStatus).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({
        plan: "free",
        usage: { productsCount: 3, ordersThisMonth: 5 },
        limits: PLAN_LIMITS.free,
        paddleStatus: null,
        currentPeriodEnd: null,
        hasPaddleSubscription: false,
      });
    });
  });

  describe("checkout", () => {
    it("should create checkout transaction for pro plan", async () => {
      const result = await controller.checkout(mockReq, { plan: "pro" });

      expect(paddleService.createCheckoutTransaction).toHaveBeenCalledWith(
        "user-1",
        "test@example.com",
        "pro",
      );
      expect(result).toEqual({ transactionId: "txn_123" });
    });

    it("should create checkout transaction for business plan", async () => {
      await controller.checkout(mockReq, { plan: "business" });

      expect(paddleService.createCheckoutTransaction).toHaveBeenCalledWith(
        "user-1",
        "test@example.com",
        "business",
      );
    });
  });

  describe("portal", () => {
    it("should create portal session and return URL", async () => {
      const result = await controller.portal(mockReq);

      expect(paddleService.createPortalSession).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({
        url: "https://portal.paddle.com/session",
      });
    });
  });
});
