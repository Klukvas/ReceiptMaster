import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken, getDataSourceToken } from "@nestjs/typeorm";
import { SubscriptionService } from "./subscription.service";
import {
  UserSubscription,
  PlanName,
} from "./entities/user-subscription.entity";
import { Product } from "../products/entities/product.entity";
import { Order } from "../orders/entities/order.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { PLAN_LIMITS } from "./config/plans.config";

describe("SubscriptionService", () => {
  let service: SubscriptionService;
  let subscriptionRepo: any;
  let productRepo: any;
  let orderRepo: any;
  let dataSource: any;

  const userId = "user-1";

  const makeSubscription = (
    plan: PlanName,
    overrides: Partial<UserSubscription> = {},
  ): Partial<UserSubscription> => ({
    id: "sub-1",
    user_id: userId,
    plan,
    paddle_status: null,
    paddle_subscription_id: null,
    paddle_customer_id: null,
    current_period_end: null,
    ...overrides,
  });

  beforeEach(async () => {
    subscriptionRepo = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
    };

    productRepo = {
      count: jest.fn().mockResolvedValue(0),
    };

    const orderQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };

    orderRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(orderQb),
      _qb: orderQb,
    };

    dataSource = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: subscriptionRepo,
        },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  // ─── getStatus ───

  describe("getStatus", () => {
    it("should return status for existing subscription", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      productRepo.count.mockResolvedValue(3);
      orderRepo._qb.getCount.mockResolvedValue(5);

      const result = await service.getStatus(userId);

      expect(result).toEqual({
        plan: "free",
        usage: { productsCount: 3, ordersThisMonth: 5 },
        limits: PLAN_LIMITS.free,
        paddleStatus: null,
        currentPeriodEnd: null,
        hasPaddleSubscription: false,
      });
    });

    it("should auto-create free subscription if none exists", async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);
      subscriptionRepo.findOneOrFail.mockResolvedValue(
        makeSubscription("free"),
      );

      const result = await service.getStatus(userId);

      expect(result.plan).toBe("free");
      expect(subscriptionRepo.createQueryBuilder).toHaveBeenCalled();
    });

    it("should return pro limits for pro plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("pro"));

      const result = await service.getStatus(userId);

      expect(result.limits).toEqual(PLAN_LIMITS.pro);
    });

    it("should return business limits for business plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("business"));

      const result = await service.getStatus(userId);

      expect(result.limits).toEqual(PLAN_LIMITS.business);
    });
  });

  // ─── assertCanCreateProduct ───

  describe("assertCanCreateProduct", () => {
    it("should pass when under free limit", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      productRepo.count.mockResolvedValue(5);

      await expect(
        service.assertCanCreateProduct(userId),
      ).resolves.toBeUndefined();
    });

    it("should throw when free limit reached (10)", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      productRepo.count.mockResolvedValue(10);

      await expect(service.assertCanCreateProduct(userId)).rejects.toThrow(
        ApiErrorResponse,
      );

      await expect(
        service.assertCanCreateProduct(userId),
      ).rejects.toMatchObject({ errorCode: "PRODUCT_LIMIT_EXCEEDED" });
    });

    it("should throw when free limit exceeded", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      productRepo.count.mockResolvedValue(15);

      await expect(service.assertCanCreateProduct(userId)).rejects.toThrow(
        ApiErrorResponse,
      );
    });

    it("should pass when pro limit not reached", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("pro"));
      productRepo.count.mockResolvedValue(50);

      await expect(
        service.assertCanCreateProduct(userId),
      ).resolves.toBeUndefined();
    });

    it("should throw when pro limit reached (100)", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("pro"));
      productRepo.count.mockResolvedValue(100);

      await expect(service.assertCanCreateProduct(userId)).rejects.toThrow(
        ApiErrorResponse,
      );
    });

    it("should always pass for business plan (unlimited)", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("business"));
      productRepo.count.mockResolvedValue(99999);

      await expect(
        service.assertCanCreateProduct(userId),
      ).resolves.toBeUndefined();
      // count should not even be called when limit is null
      expect(productRepo.count).not.toHaveBeenCalled();
    });
  });

  // ─── assertCanCreateOrder ───

  describe("assertCanCreateOrder", () => {
    it("should pass when under free limit", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      orderRepo._qb.getCount.mockResolvedValue(10);

      await expect(
        service.assertCanCreateOrder(userId),
      ).resolves.toBeUndefined();
    });

    it("should throw when free limit reached (20)", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      orderRepo._qb.getCount.mockResolvedValue(20);

      await expect(service.assertCanCreateOrder(userId)).rejects.toThrow(
        ApiErrorResponse,
      );

      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      orderRepo._qb.getCount.mockResolvedValue(20);

      await expect(service.assertCanCreateOrder(userId)).rejects.toMatchObject({
        errorCode: "ORDER_MONTHLY_LIMIT_EXCEEDED",
      });
    });

    it("should pass when pro limit not reached", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("pro"));
      orderRepo._qb.getCount.mockResolvedValue(200);

      await expect(
        service.assertCanCreateOrder(userId),
      ).resolves.toBeUndefined();
    });

    it("should throw when pro limit reached (500)", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("pro"));
      orderRepo._qb.getCount.mockResolvedValue(500);

      await expect(service.assertCanCreateOrder(userId)).rejects.toThrow(
        ApiErrorResponse,
      );
    });

    it("should always pass for business plan (unlimited)", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("business"));

      await expect(
        service.assertCanCreateOrder(userId),
      ).resolves.toBeUndefined();
      expect(orderRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── assertCanCreateOrderInTx ───

  describe("assertCanCreateOrderInTx", () => {
    it("should pass when under limit in transaction", async () => {
      const txQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(5),
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue(makeSubscription("free")),
        createQueryBuilder: jest.fn().mockReturnValue(txQb),
      } as any;

      await expect(
        service.assertCanCreateOrderInTx(manager, userId),
      ).resolves.toBeUndefined();

      expect(manager.findOne).toHaveBeenCalledWith(
        UserSubscription,
        expect.objectContaining({
          where: { user_id: userId },
          lock: { mode: "pessimistic_read" },
        }),
      );
    });

    it("should throw when limit reached in transaction", async () => {
      const txQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(20),
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue(makeSubscription("free")),
        createQueryBuilder: jest.fn().mockReturnValue(txQb),
      } as any;

      await expect(
        service.assertCanCreateOrderInTx(manager, userId),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should default to free plan if no subscription found", async () => {
      const txQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(20),
      };

      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        createQueryBuilder: jest.fn().mockReturnValue(txQb),
      } as any;

      await expect(
        service.assertCanCreateOrderInTx(manager, userId),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should pass for business plan in transaction", async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(makeSubscription("business")),
        createQueryBuilder: jest.fn(),
      } as any;

      await expect(
        service.assertCanCreateOrderInTx(manager, userId),
      ).resolves.toBeUndefined();
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── getAllowedTemplateIds ───

  describe("getAllowedTemplateIds", () => {
    it("should return restricted list for free plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));

      const result = await service.getAllowedTemplateIds(userId);

      expect(result).toEqual(["standard", "compact", "minimal"]);
    });

    it("should return null (all allowed) for pro plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("pro"));

      const result = await service.getAllowedTemplateIds(userId);

      expect(result).toBeNull();
    });

    it("should return null (all allowed) for business plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("business"));

      const result = await service.getAllowedTemplateIds(userId);

      expect(result).toBeNull();
    });
  });

  // ─── assertCanUseTemplate ───

  describe("assertCanUseTemplate", () => {
    it("should pass for allowed template on free plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));

      await expect(
        service.assertCanUseTemplate(userId, "standard"),
      ).resolves.toBeUndefined();

      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      await expect(
        service.assertCanUseTemplate(userId, "compact"),
      ).resolves.toBeUndefined();

      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      await expect(
        service.assertCanUseTemplate(userId, "minimal"),
      ).resolves.toBeUndefined();
    });

    it("should throw for restricted template on free plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));

      await expect(
        service.assertCanUseTemplate(userId, "elegant"),
      ).rejects.toThrow(ApiErrorResponse);

      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));
      await expect(
        service.assertCanUseTemplate(userId, "elegant"),
      ).rejects.toMatchObject({ errorCode: "TEMPLATE_PLAN_RESTRICTED" });
    });

    it("should throw for all non-allowed templates on free plan", async () => {
      const restricted = [
        "classic",
        "modern",
        "elegant",
        "vintage",
        "tech",
        "wave",
        "corporate",
      ];

      for (const templateId of restricted) {
        subscriptionRepo.findOne.mockResolvedValue(makeSubscription("free"));

        await expect(
          service.assertCanUseTemplate(userId, templateId),
        ).rejects.toThrow(ApiErrorResponse);
      }
    });

    it("should pass for any template on pro plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("pro"));

      await expect(
        service.assertCanUseTemplate(userId, "elegant"),
      ).resolves.toBeUndefined();
    });

    it("should pass for any template on business plan", async () => {
      subscriptionRepo.findOne.mockResolvedValue(makeSubscription("business"));

      await expect(
        service.assertCanUseTemplate(userId, "vintage"),
      ).resolves.toBeUndefined();
    });
  });
});
