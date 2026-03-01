import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken, getDataSourceToken } from "@nestjs/typeorm";
import { HttpStatus } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { Order, OrderStatus } from "./entities/order.entity";
import { OrderItem } from "./entities/order-item.entity";
import { IdempotencyKey } from "./entities/idempotency-key.entity";
import { Product } from "../products/entities/product.entity";
import { Recipient } from "../recipients/entities/recipient.entity";
import { ReceiptsService } from "../receipts/receipts.service";
import { CacheService } from "../../common/services/cache.service";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { SubscriptionService } from "../subscription/subscription.service";

describe("OrdersService", () => {
  let service: OrdersService;
  let ordersRepo: any;
  let orderItemsRepo: any;
  let idempotencyKeyRepo: any;
  let productsRepo: any;
  let recipientsRepo: any;
  let dataSource: any;
  let receiptsService: any;
  let cacheService: any;
  const mockUser = { id: "user-1" } as User;

  const mockOrder: Partial<Order> = {
    id: "order-1",
    recipient_id: "rec-1",
    status: OrderStatus.DRAFT,
    subtotal_cents: 5000,
    total_cents: 5000,
    currency: "UAH",
    user_id: "user-1",
    is_locked: false,
  };

  const mockConfirmedOrder: Partial<Order> = {
    ...mockOrder,
    status: OrderStatus.CONFIRMED,
  };

  beforeEach(async () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockOrder], 1]),
    };

    ordersRepo = {
      findOne: jest.fn(),
      save: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    orderItemsRepo = {};
    idempotencyKeyRepo = {};
    productsRepo = {};
    recipientsRepo = {};

    dataSource = {
      transaction: jest.fn(),
      query: jest.fn(),
    };

    receiptsService = {};
    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemsRepo },
        {
          provide: getRepositoryToken(IdempotencyKey),
          useValue: idempotencyKeyRepo,
        },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: getRepositoryToken(Recipient), useValue: recipientsRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ReceiptsService, useValue: receiptsService },
        { provide: CacheService, useValue: cacheService },
        {
          provide: SubscriptionService,
          useValue: {
            assertCanCreateOrder: jest.fn(),
            assertCanCreateOrderInTx: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe("findAll", () => {
    it("should return paginated orders", async () => {
      const result = await service.findAll({ limit: 10, offset: 0 }, mockUser);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("should apply status filter", async () => {
      const qb = ordersRepo.createQueryBuilder();

      await service.findAll(
        { limit: 10, offset: 0 },
        mockUser,
        OrderStatus.CONFIRMED,
      );

      expect(qb.andWhere).toHaveBeenCalled();
    });

    it("should apply date range filters", async () => {
      const qb = ordersRepo.createQueryBuilder();

      await service.findAll({ limit: 10, offset: 0 }, mockUser, undefined, {
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
      });

      expect(qb.andWhere).toHaveBeenCalledTimes(2);
    });

    it("should apply amount filters", async () => {
      const qb = ordersRepo.createQueryBuilder();

      await service.findAll({ limit: 10, offset: 0 }, mockUser, undefined, {
        minAmount: 1000,
        maxAmount: 5000,
      });

      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  describe("findOne", () => {
    it("should return order with relations", async () => {
      ordersRepo.findOne.mockResolvedValue(mockOrder);

      const result = await service.findOne("order-1", mockUser);

      expect(result).toEqual(mockOrder);
      expect(ordersRepo.findOne).toHaveBeenCalledWith({
        where: { id: "order-1", user_id: "user-1" },
        relations: ["recipient", "items", "receipts"],
      });
    });

    it("should throw if order not found", async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("unknown", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("confirm", () => {
    it("should confirm a draft order", async () => {
      ordersRepo.findOne.mockResolvedValue({ ...mockOrder });

      const result = await service.confirm("order-1", mockUser);

      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(ordersRepo.save).toHaveBeenCalled();
    });

    it("should throw if order is not in draft status", async () => {
      ordersRepo.findOne.mockResolvedValue(mockConfirmedOrder);

      await expect(service.confirm("order-1", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("cancel", () => {
    it("should cancel an order", async () => {
      ordersRepo.findOne.mockResolvedValue({ ...mockOrder });

      const result = await service.cancel("order-1", mockUser);

      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it("should throw if order is already cancelled", async () => {
      ordersRepo.findOne.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });

      await expect(service.cancel("order-1", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("markAsLocked", () => {
    it("should lock an order", async () => {
      await service.markAsLocked("order-1", mockUser);

      expect(ordersRepo.update).toHaveBeenCalledWith(
        { id: "order-1", user_id: "user-1" },
        { is_locked: true },
      );
    });
  });

  describe("unlockOrder", () => {
    it("should unlock an order", async () => {
      await service.unlockOrder("order-1", mockUser);

      expect(ordersRepo.update).toHaveBeenCalledWith(
        { id: "order-1", user_id: "user-1" },
        { is_locked: false },
      );
    });
  });

  describe("create", () => {
    it("should create order via transaction", async () => {
      const _createdOrder = {
        ...mockOrder,
        id: "new-order-1",
      };

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ id: "rec-1", user_id: "user-1" }) // recipient
            .mockResolvedValueOnce(null), // no idempotency key
          find: jest.fn().mockResolvedValue([
            {
              id: "prod-1",
              user_id: "user-1",
              sale_price_cents: 1000,
              quantity: 50,
              currency: "UAH",
              name: "Widget",
            },
          ]),
          create: jest.fn((entity, data) => ({ ...data })),
          save: jest.fn((entity, data) =>
            Promise.resolve({ id: "new-order-1", ...data }),
          ),
          query: jest.fn(),
        };

        return cb(manager);
      });

      const result = await service.create(
        {
          recipientId: "rec-1",
          items: [{ productId: "prod-1", qty: 2 }],
        } as any,
        mockUser,
      );

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.isFromCache).toBe(false);
    });
  });

  describe("approveBatch", () => {
    it("should approve batch of draft orders", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest.fn().mockResolvedValue([
            { id: "o1", status: OrderStatus.DRAFT },
            { id: "o2", status: OrderStatus.DRAFT },
          ]),
          update: jest.fn(),
        };
        return cb(manager);
      });

      const result = await service.approveBatch(["o1", "o2"], mockUser);

      expect(result.approved).toBe(2);
    });

    it("should throw when some orders are not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest
            .fn()
            .mockResolvedValue([{ id: "o1", status: OrderStatus.DRAFT }]),
        };
        return cb(manager);
      });

      await expect(
        service.approveBatch(["o1", "o2"], mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw when some orders are not draft", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest.fn().mockResolvedValue([
            { id: "o1", status: OrderStatus.DRAFT },
            { id: "o2", status: OrderStatus.CONFIRMED },
          ]),
        };
        return cb(manager);
      });

      await expect(
        service.approveBatch(["o1", "o2"], mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("update", () => {
    it("should update order with new items", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({
              ...mockOrder,
              status: OrderStatus.DRAFT,
              is_locked: false,
            })
            .mockResolvedValueOnce({
              id: "order-1",
              recipient: {},
              items: [],
            }),
          find: jest
            .fn()
            .mockResolvedValueOnce([{ product_id: "prod-1", qty: 2 }]) // existing items
            .mockResolvedValueOnce([
              {
                id: "prod-1",
                user_id: "user-1",
                name: "Old Product",
                quantity: 5,
                sale_price_cents: 1000,
                currency: "UAH",
              },
              {
                id: "prod-2",
                user_id: "user-1",
                name: "New Product",
                quantity: 10,
                sale_price_cents: 2000,
                currency: "UAH",
              },
            ]),
          create: jest.fn((_, data) => ({ ...data })),
          save: jest.fn((_, data) => Promise.resolve(data)),
          delete: jest.fn(),
        };
        return cb(manager);
      });

      const result = await service.update(
        "order-1",
        { items: [{ productId: "prod-2", qty: 3 }] } as any,
        mockUser,
      );

      expect(result).toBeDefined();
    });

    it("should throw if order not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(manager);
      });

      await expect(
        service.update("order-1", {} as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if order not in draft", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockOrder,
            status: OrderStatus.CONFIRMED,
          }),
        };
        return cb(manager);
      });

      await expect(
        service.update("order-1", {} as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if order is locked", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockOrder,
            status: OrderStatus.DRAFT,
            is_locked: true,
          }),
        };
        return cb(manager);
      });

      await expect(
        service.update("order-1", {} as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should update recipient", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({
              ...mockOrder,
              status: OrderStatus.DRAFT,
              is_locked: false,
            })
            .mockResolvedValueOnce({ id: "rec-2", user_id: "user-1" }) // recipient
            .mockResolvedValueOnce({ id: "order-1", recipient_id: "rec-2" }), // final findOne
          save: jest.fn((_, data) => Promise.resolve(data)),
        };
        return cb(manager);
      });

      const result = await service.update(
        "order-1",
        { recipientId: "rec-2" } as any,
        mockUser,
      );
      expect(result).toBeDefined();
    });

    it("should throw if recipient not found during update", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({
              ...mockOrder,
              status: OrderStatus.DRAFT,
              is_locked: false,
            })
            .mockResolvedValueOnce(null), // recipient not found
        };
        return cb(manager);
      });

      await expect(
        service.update("order-1", { recipientId: "rec-2" } as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if product not owned by user", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockOrder,
            status: OrderStatus.DRAFT,
            is_locked: false,
          }),
          find: jest
            .fn()
            .mockResolvedValueOnce([]) // existing items
            .mockResolvedValueOnce([
              {
                id: "prod-other",
                user_id: "other-user",
                name: "Product",
                quantity: 10,
                sale_price_cents: 1000,
                currency: "UAH",
              },
            ]),
        };
        return cb(manager);
      });

      await expect(
        service.update(
          "order-1",
          { items: [{ productId: "prod-other", qty: 1 }] } as any,
          mockUser,
        ),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if insufficient quantity during update", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockOrder,
            status: OrderStatus.DRAFT,
            is_locked: false,
          }),
          find: jest
            .fn()
            .mockResolvedValueOnce([]) // existing items
            .mockResolvedValueOnce([
              {
                id: "prod-1",
                user_id: "user-1",
                name: "Product",
                quantity: 1,
                sale_price_cents: 1000,
                currency: "UAH",
              },
            ]),
        };
        return cb(manager);
      });

      await expect(
        service.update(
          "order-1",
          { items: [{ productId: "prod-1", qty: 5 }] } as any,
          mockUser,
        ),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("remove", () => {
    it("should soft delete order and restore quantities", async () => {
      ordersRepo.findOne.mockResolvedValue({
        ...mockOrder,
        id: "order-1",
      });

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest.fn().mockResolvedValue([{ product_id: "prod-1", qty: 2 }]),
          findOne: jest.fn().mockResolvedValue({
            id: "prod-1",
            quantity: 5,
          }),
          save: jest.fn(),
          softDelete: jest.fn(),
          increment: jest.fn(),
        };
        return cb(manager);
      });

      await service.remove("order-1", mockUser);
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it("should handle product not found during removal", async () => {
      ordersRepo.findOne.mockResolvedValue({
        ...mockOrder,
        id: "order-1",
      });

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest.fn().mockResolvedValue([{ product_id: "prod-1", qty: 2 }]),
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
          softDelete: jest.fn(),
          increment: jest.fn(),
        };
        return cb(manager);
      });

      await service.remove("order-1", mockUser);
    });
  });

  describe("deleteBatch", () => {
    it("should delete batch and restore quantities", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest
            .fn()
            .mockResolvedValueOnce([{ id: "o1" }, { id: "o2" }]) // orders
            .mockResolvedValueOnce([{ product_id: "p1", qty: 1 }]) // items for o1
            .mockResolvedValueOnce([{ product_id: "p2", qty: 2 }]), // items for o2
          findOne: jest.fn().mockResolvedValue({
            id: "p1",
            quantity: 5,
          }),
          save: jest.fn(),
          softDelete: jest.fn(),
          increment: jest.fn(),
        };
        return cb(manager);
      });

      const result = await service.deleteBatch(["o1", "o2"], mockUser);

      expect(result.deleted).toBe(2);
      expect(cacheService.delByPattern).toHaveBeenCalled();
    });

    it("should throw if some orders not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest.fn().mockResolvedValue([{ id: "o1" }]),
        };
        return cb(manager);
      });

      await expect(service.deleteBatch(["o1", "o2"], mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("create with idempotency", () => {
    it("should return cached response for duplicate key", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            key: "idem-key",
            user_id: "user-1",
            response: { id: "order-1" },
            status_code: HttpStatus.CREATED,
            expires_at: new Date(Date.now() + 86400000),
          }),
          query: jest.fn(),
        };
        return cb(manager);
      });

      const result = await service.create(
        { recipientId: "rec-1", items: [{ productId: "p1", qty: 1 }] } as any,
        mockUser,
        "idem-key",
      );

      expect(result.isFromCache).toBe(true);
      expect(cacheService.delByPattern).not.toHaveBeenCalled();
    });

    it("should delete expired key and proceed", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({
              id: "idem-1",
              key: "idem-key",
              user_id: "user-1",
              expires_at: new Date(Date.now() - 86400000), // expired
            })
            .mockResolvedValueOnce({ id: "rec-1", user_id: "user-1" }), // recipient
          find: jest.fn().mockResolvedValue([
            {
              id: "p1",
              user_id: "user-1",
              sale_price_cents: 1000,
              quantity: 50,
              currency: "UAH",
              name: "Widget",
            },
          ]),
          create: jest.fn((_, data) => ({ ...data })),
          save: jest.fn((_, data) =>
            Promise.resolve({ id: "new-order", ...data }),
          ),
          query: jest.fn(),
          delete: jest.fn(),
        };
        return cb(manager);
      });

      const result = await service.create(
        { recipientId: "rec-1", items: [{ productId: "p1", qty: 1 }] } as any,
        mockUser,
        "idem-key",
      );

      expect(result.statusCode).toBe(HttpStatus.CREATED);
    });

    it("should throw on insufficient product quantity", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValue({ id: "rec-1", user_id: "user-1" }),
          find: jest.fn().mockResolvedValue([
            {
              id: "p1",
              user_id: "user-1",
              sale_price_cents: 1000,
              quantity: 0, // no stock
              currency: "UAH",
              name: "Widget",
            },
          ]),
          query: jest.fn(),
        };
        return cb(manager);
      });

      await expect(
        service.create(
          { recipientId: "rec-1", items: [{ productId: "p1", qty: 5 }] } as any,
          mockUser,
        ),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if recipient not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
          query: jest.fn(),
        };
        return cb(manager);
      });

      await expect(
        service.create(
          { recipientId: "rec-1", items: [{ productId: "p1", qty: 1 }] } as any,
          mockUser,
        ),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if products not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValue({ id: "rec-1", user_id: "user-1" }),
          find: jest.fn().mockResolvedValue([]), // no products found
          query: jest.fn(),
        };
        return cb(manager);
      });

      await expect(
        service.create(
          { recipientId: "rec-1", items: [{ productId: "p1", qty: 1 }] } as any,
          mockUser,
        ),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should use custom price when provided", async () => {
      let savedTotal: number | undefined;

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValue({ id: "rec-1", user_id: "user-1" }),
          find: jest.fn().mockResolvedValue([
            {
              id: "p1",
              user_id: "user-1",
              sale_price_cents: 1000,
              quantity: 50,
              currency: "UAH",
              name: "Widget",
            },
          ]),
          create: jest.fn((_, data) => {
            if (data.total_cents !== undefined) {
              savedTotal = data.total_cents;
            }
            return { ...data };
          }),
          save: jest.fn((_, data) =>
            Promise.resolve({ id: "new-order", ...data }),
          ),
          query: jest.fn(),
        };
        return cb(manager);
      });

      await service.create(
        {
          recipientId: "rec-1",
          items: [{ productId: "p1", qty: 1, unitPriceCents: 5000 }],
        } as any,
        mockUser,
      );

      expect(savedTotal).toBe(5000);
    });
  });

  describe("dashboard methods", () => {
    it("getOrderStatusSummary should return status counts", async () => {
      dataSource.query.mockResolvedValue([
        { status: "draft", count: 5 },
        { status: "confirmed", count: 10 },
        { status: "cancelled", count: 2 },
      ]);

      const result = await service.getOrderStatusSummary(mockUser);

      expect(result).toEqual({ draft: 5, confirmed: 10, cancelled: 2 });
    });

    it("getOrderStatusSummary should return zeros when no data", async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await service.getOrderStatusSummary(mockUser);

      expect(result).toEqual({ draft: 0, confirmed: 0, cancelled: 0 });
    });

    it("getTotalRevenue should return revenue data", async () => {
      dataSource.query.mockResolvedValue([
        {
          total_revenue_cents: "150000",
          total_orders: "15",
          currency: "UAH",
        },
      ]);

      const result = await service.getTotalRevenue(mockUser);

      expect(result.total_revenue_cents).toBe(150000);
      expect(result.total_orders).toBe(15);
      expect(result.currency).toBe("UAH");
    });

    it("getTotalRevenue should return defaults when no data", async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await service.getTotalRevenue(mockUser);

      expect(result.total_revenue_cents).toBe(0);
      expect(result.total_orders).toBe(0);
      expect(result.currency).toBe("UAH");
    });

    it("getTotalTurnover should return turnover data", async () => {
      dataSource.query.mockResolvedValue([
        {
          total_turnover_cents: "200000",
          total_orders: "20",
          currency: "UAH",
        },
      ]);

      const result = await service.getTotalTurnover(mockUser);

      expect(result.total_turnover_cents).toBe(200000);
      expect(result.total_orders).toBe(20);
    });

    it("getDailyRevenue should return daily data", async () => {
      dataSource.query.mockResolvedValue([
        { date: "2025-01-01", revenue_cents: "5000", turnover_cents: "10000" },
      ]);

      const result = await service.getDailyRevenue(mockUser, 7);

      expect(result).toHaveLength(1);
      expect(result[0].revenue_cents).toBe(5000);
      expect(result[0].turnover_cents).toBe(10000);
    });

    it("should use cache for dashboard methods", async () => {
      cacheService.get.mockResolvedValue({
        draft: 1,
        confirmed: 2,
        cancelled: 0,
      });

      const result = await service.getOrderStatusSummary(mockUser);

      expect(result).toEqual({ draft: 1, confirmed: 2, cancelled: 0 });
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it("getRevenueByProducts should return product revenue", async () => {
      dataSource.query.mockResolvedValue([
        {
          product_id: "p1",
          product_name: "Widget",
          total_revenue_cents: "5000",
          total_quantity: "10",
          currency: "UAH",
        },
      ]);

      const result = await service.getRevenueByProducts(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].product_name).toBe("Widget");
      expect(result[0].total_revenue_cents).toBe(5000);
    });

    it("getRevenueByRecipients should return recipient revenue", async () => {
      dataSource.query.mockResolvedValue([
        {
          recipient_id: "r1",
          recipient_name: "John",
          total_revenue_cents: "8000",
          total_orders: "3",
          currency: "UAH",
        },
      ]);

      const result = await service.getRevenueByRecipients(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].recipient_name).toBe("John");
    });

    it("getTurnoverByProducts should return product turnover", async () => {
      dataSource.query.mockResolvedValue([
        {
          product_id: "p1",
          product_name: "Widget",
          total_turnover_cents: "15000",
          total_quantity: "10",
          currency: "UAH",
        },
      ]);

      const result = await service.getTurnoverByProducts(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].total_turnover_cents).toBe(15000);
    });

    it("getTurnoverByRecipients should return recipient turnover", async () => {
      dataSource.query.mockResolvedValue([
        {
          recipient_id: "r1",
          recipient_name: "John",
          total_turnover_cents: "20000",
          total_orders: "5",
          currency: "UAH",
        },
      ]);

      const result = await service.getTurnoverByRecipients(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].total_turnover_cents).toBe(20000);
    });

    it("getRevenueByProducts should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);
      const start = new Date("2025-01-01");
      const end = new Date("2025-12-31");

      await service.getRevenueByProducts(mockUser, start, end);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("created_at >="),
        expect.arrayContaining([start, end]),
      );
    });

    it("getRevenueByRecipients should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getRevenueByRecipients(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTotalRevenue should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTotalRevenue(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTurnoverByProducts should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTurnoverByProducts(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTurnoverByRecipients should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTurnoverByRecipients(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTotalTurnover should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTotalTurnover(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTotalTurnover should return defaults when no data", async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await service.getTotalTurnover(mockUser);

      expect(result).toEqual({
        total_turnover_cents: 0,
        total_orders: 0,
        currency: "UAH",
      });
    });

    it("findAll should apply search filter", async () => {
      const qb = ordersRepo.createQueryBuilder();

      await service.findAll({ limit: 10, offset: 0, search: "John" }, mockUser);

      expect(qb.andWhere).toHaveBeenCalledWith(
        "recipient.name ILIKE :search",
        expect.objectContaining({ search: "%John%" }),
      );
    });

    it("findAll should apply sort by column", async () => {
      const qb = ordersRepo.createQueryBuilder();

      await service.findAll(
        { limit: 10, offset: 0, sortBy: "total_cents" },
        mockUser,
      );

      expect(qb.orderBy).toHaveBeenCalledWith(
        "order.total_cents",
        expect.any(String),
      );
    });
  });
});
