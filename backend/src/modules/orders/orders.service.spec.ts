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
import { SettingsService } from "../settings/services/settings.service";

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
  let settingsService: any;
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

    receiptsService = {
      generateReceipt: jest.fn(),
      voidForCancellation: jest.fn().mockResolvedValue(0),
    };
    settingsService = {
      getAutoGenerateReceipt: jest.fn().mockResolvedValue(false),
    };
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
        { provide: SettingsService, useValue: settingsService },
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

  /** A transaction whose locked order row is `locked`; returns the manager. */
  const lockedOrderTransaction = (locked: Partial<Order> | null) => {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(locked && { ...locked }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneOrFail: jest.fn().mockImplementation(async () => ({
        ...locked,
        status: manager.update.mock.calls.at(-1)?.[2]?.status,
      })),
    };
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
    return manager;
  };

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
    it("locks the order and fences the update on the DRAFT it saw", async () => {
      const manager = lockedOrderTransaction(mockOrder);

      const result = await service.confirm("order-1", mockUser);

      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(manager.findOne).toHaveBeenCalledWith(Order, {
        where: { id: "order-1", user_id: "user-1" },
        lock: { mode: "pessimistic_write" },
      });
      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: "order-1", user_id: "user-1", status: OrderStatus.DRAFT },
        { status: OrderStatus.CONFIRMED },
      );
      expect(ordersRepo.save).not.toHaveBeenCalled();
      expect(cacheService.delByPattern).toHaveBeenCalledWith(
        "dashboard:*:user-1:*",
      );
    });

    it("should throw if order is not in draft status", async () => {
      const manager = lockedOrderTransaction(mockConfirmedOrder);

      await expect(service.confirm("order-1", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it("rejects an order cancelled before the lock was granted", async () => {
      lockedOrderTransaction({ ...mockOrder, status: OrderStatus.CANCELLED });

      await expect(service.confirm("order-1", mockUser)).rejects.toMatchObject({
        errorCode: "ORDER_CANNOT_BE_MODIFIED",
      });
    });

    it("returns 404 for a missing order", async () => {
      lockedOrderTransaction(null);

      await expect(service.confirm("order-1", mockUser)).rejects.toMatchObject({
        errorCode: "ORDER_NOT_FOUND",
      });
    });
  });

  describe("auto-generated receipts", () => {
    const approveDrafts = (ids: string[]) =>
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          find: jest
            .fn()
            .mockResolvedValue(
              ids.map((id) => ({ id, status: OrderStatus.DRAFT })),
            ),
          update: jest.fn(),
        }),
      );

    it("does not generate a receipt when the setting is off", async () => {
      lockedOrderTransaction(mockOrder);

      await service.confirm("order-1", mockUser);

      expect(receiptsService.generateReceipt).not.toHaveBeenCalled();
    });

    it("queues a receipt after confirm when the setting is on", async () => {
      settingsService.getAutoGenerateReceipt.mockResolvedValue(true);
      lockedOrderTransaction(mockOrder);

      await service.confirm("order-1", mockUser);

      expect(receiptsService.generateReceipt).toHaveBeenCalledWith(
        "order-1",
        mockUser,
      );
    });

    it("still confirms the order when receipt generation fails", async () => {
      settingsService.getAutoGenerateReceipt.mockResolvedValue(true);
      receiptsService.generateReceipt.mockRejectedValue(new Error("limit"));
      lockedOrderTransaction(mockOrder);

      const result = await service.confirm("order-1", mockUser);

      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it("still confirms the order when the setting lookup fails", async () => {
      settingsService.getAutoGenerateReceipt.mockRejectedValue(
        new Error("redis down"),
      );
      lockedOrderTransaction(mockOrder);

      const result = await service.confirm("order-1", mockUser);

      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(receiptsService.generateReceipt).not.toHaveBeenCalled();
    });

    it("queues a receipt for every approved order and survives one failure", async () => {
      settingsService.getAutoGenerateReceipt.mockResolvedValue(true);
      receiptsService.generateReceipt
        .mockRejectedValueOnce(new Error("snapshot failed"))
        .mockResolvedValueOnce({});
      approveDrafts(["o1", "o2"]);

      const result = await service.approveBatch(["o1", "o2", "o1"], mockUser);

      expect(result.approved).toBe(2);
      expect(receiptsService.generateReceipt.mock.calls).toEqual([
        ["o1", mockUser],
        ["o2", mockUser],
      ]);
    });

    it("does not generate receipts when batch approval fails", async () => {
      settingsService.getAutoGenerateReceipt.mockResolvedValue(true);
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          find: jest
            .fn()
            .mockResolvedValue([{ id: "o1", status: OrderStatus.CONFIRMED }]),
        }),
      );

      await expect(service.approveBatch(["o1"], mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
      expect(receiptsService.generateReceipt).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    it("cancels a draft without touching documents", async () => {
      const manager = lockedOrderTransaction(mockOrder);
      ordersRepo.findOne.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });

      const result = await service.cancel("order-1", mockUser);

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(receiptsService.voidForCancellation).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: "order-1", user_id: "user-1", status: OrderStatus.DRAFT },
        { status: OrderStatus.CANCELLED },
      );
      expect(cacheService.delByPattern).toHaveBeenCalledWith(
        "dashboard:*:user-1:*",
      );
    });

    it("takes the tenant lock first, then voids a confirmed order's documents", async () => {
      const manager = lockedOrderTransaction(mockConfirmedOrder);
      ordersRepo.findOne.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });

      await service.cancel("order-1", mockUser);

      expect(manager.query).toHaveBeenCalledWith(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        ["user-1"],
      );
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.findOne.mock.invocationCallOrder[0],
      );
      expect(receiptsService.voidForCancellation).toHaveBeenCalledWith(
        manager,
        "order-1",
        "user-1",
      );
      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: "order-1", user_id: "user-1", status: OrderStatus.CONFIRMED },
        { status: OrderStatus.CANCELLED },
      );
    });

    it("should throw if order is already cancelled", async () => {
      const manager = lockedOrderTransaction({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });

      await expect(service.cancel("order-1", mockUser)).rejects.toMatchObject({
        errorCode: "ORDER_ALREADY_CANCELLED",
      });
      expect(manager.update).not.toHaveBeenCalled();
      expect(receiptsService.voidForCancellation).not.toHaveBeenCalled();
    });

    it("never changes product stock", async () => {
      const manager = lockedOrderTransaction(mockConfirmedOrder);
      ordersRepo.findOne.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });

      await service.cancel("order-1", mockUser);

      expect(
        manager.update.mock.calls.every(([entity]) => entity === Order),
      ).toBe(true);
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
      const manager = {
        find: jest.fn().mockResolvedValue([
          { id: "o1", status: OrderStatus.DRAFT },
          { id: "o2", status: OrderStatus.DRAFT },
        ]),
        update: jest.fn(),
      };
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

      const result = await service.approveBatch(["o2", "o1"], mockUser);

      expect(result.approved).toBe(2);
      expect(manager.find).toHaveBeenCalledWith(Order, {
        where: { id: expect.anything(), user_id: "user-1" },
        order: { id: "ASC" },
        lock: { mode: "pessimistic_write" },
      });
      expect(manager.find.mock.calls[0][1].where.id.value).toEqual([
        "o1",
        "o2",
      ]);
      expect(manager.update.mock.calls[0][1]).toMatchObject({
        user_id: "user-1",
        status: OrderStatus.DRAFT,
      });
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
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest.fn().mockResolvedValue([{ product_id: "prod-1", qty: 2 }]),
          findOne: jest.fn().mockResolvedValue({ ...mockOrder }),
          save: jest.fn(),
          softDelete: jest.fn(),
          increment: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return cb(manager);
      });

      await service.remove("order-1", mockUser);
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it("should handle product not found during removal", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          find: jest.fn().mockResolvedValue([{ product_id: "prod-1", qty: 2 }]),
          findOne: jest.fn().mockResolvedValue({ ...mockOrder }),
          save: jest.fn(),
          softDelete: jest.fn(),
          increment: jest.fn().mockResolvedValue({ affected: 0 }),
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
});
