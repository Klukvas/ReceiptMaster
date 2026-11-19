import { SubscriptionController } from "./subscription.controller";
import { User } from "../users/entities/user.entity";
import { PLAN_LIMITS } from "./config/plans.config";

describe("SubscriptionController", () => {
  let controller: SubscriptionController;
  let subscriptionService: any;
  let creemService: any;
  const mockUser = { id: "user-1", email: "test@example.com" } as User;
  const mockReq = { user: mockUser };

  beforeEach(() => {
    subscriptionService = {
      getStatus: jest.fn().mockResolvedValue({
        plan: "free",
        usage: { productsCount: 3, ordersThisMonth: 5 },
        limits: PLAN_LIMITS.free,
        billingStatus: null,
        currentPeriodEnd: null,
        hasBillingSubscription: false,
      }),
    };

    creemService = {
      createCheckout: jest
        .fn()
        .mockResolvedValue({ checkoutUrl: "https://checkout.creem.io/ch_123" }),
      createPortalSession: jest
        .fn()
        .mockResolvedValue({ url: "https://creem.io/my-orders/login/session" }),
    };

    controller = new SubscriptionController(subscriptionService, creemService);
  });

  describe("getStatus", () => {
    it("should return subscription status for user", async () => {
      const result = await controller.getStatus(mockReq);

      expect(subscriptionService.getStatus).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({
        plan: "free",
        usage: { productsCount: 3, ordersThisMonth: 5 },
        limits: PLAN_LIMITS.free,
        billingStatus: null,
        currentPeriodEnd: null,
        hasBillingSubscription: false,
      });
    });
  });

  describe("checkout", () => {
    it("should create checkout transaction for pro plan", async () => {
      const result = await controller.checkout(mockReq, { plan: "pro" });

      expect(creemService.createCheckout).toHaveBeenCalledWith(
        "user-1",
        "test@example.com",
        "pro",
      );
      expect(result).toEqual({
        checkoutUrl: "https://checkout.creem.io/ch_123",
      });
    });

    it("should create checkout transaction for business plan", async () => {
      await controller.checkout(mockReq, { plan: "business" });

      expect(creemService.createCheckout).toHaveBeenCalledWith(
        "user-1",
        "test@example.com",
        "business",
      );
    });
  });

  describe("portal", () => {
    it("should create portal session and return URL", async () => {
      const result = await controller.portal(mockReq);

      expect(creemService.createPortalSession).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({
        url: "https://creem.io/my-orders/login/session",
      });
    });
  });
});
