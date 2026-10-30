import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken, getDataSourceToken } from "@nestjs/typeorm";
import { ProductsService } from "./products.service";
import { Product } from "./entities/product.entity";
import { ApiErrorResponse, ApiErrors } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { SortOrder } from "../../common/dto/pagination.dto";
import { SubscriptionService } from "../subscription/subscription.service";

describe("ProductsService", () => {
  let service: ProductsService;
  let productsRepo: any;
  let dataSource: any;
  let txManager: any;
  let queryBuilder: any;
  let subscriptionService: { assertCanCreateProductInTx: jest.Mock };
  const mockUser = { id: "user-1" } as User;

  const mockProduct: Partial<Product> = {
    id: "prod-1",
    name: "Widget",
    purchase_price_cents: 500,
    sale_price_cents: 1000,
    quantity: 50,
    user_id: "user-1",
  };

  beforeEach(async () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockProduct], 1]),
      getMany: jest.fn().mockResolvedValue([mockProduct]),
      getRawOne: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    queryBuilder = mockQueryBuilder;
    txManager = {
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "prod-1", ...data })),
    };
    productsRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: { transaction: jest.fn((work) => work(txManager)) },
    };
    subscriptionService = { assertCanCreateProductInTx: jest.fn() };

    dataSource = {
      query: jest.fn().mockResolvedValue([{ count: "0" }]),
      transaction: jest.fn((cb) =>
        cb({
          query: jest.fn(),
          delete: jest.fn(),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: SubscriptionService, useValue: subscriptionService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe("create", () => {
    it("should create a product", async () => {
      const dto = {
        name: "Widget",
        purchase_price_cents: 500,
        sale_price_cents: 1000,
        quantity: 50,
        currency: "UAH",
      };

      const result = await service.create(dto as any, mockUser);

      expect(txManager.create).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ ...dto, user_id: "user-1" }),
      );
      expect(txManager.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("checks the quota in the same transaction, before the insert", async () => {
      await service.create({ name: "Widget" } as any, mockUser);

      expect(
        subscriptionService.assertCanCreateProductInTx,
      ).toHaveBeenCalledWith(txManager, "user-1");
      expect(
        subscriptionService.assertCanCreateProductInTx.mock
          .invocationCallOrder[0],
      ).toBeLessThan(txManager.save.mock.invocationCallOrder[0]);
    });

    it("does not insert when the quota is exhausted", async () => {
      subscriptionService.assertCanCreateProductInTx.mockRejectedValue(
        ApiErrors.PRODUCT_LIMIT_EXCEEDED(10),
      );

      await expect(
        service.create({ name: "Widget" } as any, mockUser),
      ).rejects.toMatchObject({ errorCode: "PRODUCT_LIMIT_EXCEEDED" });
      expect(txManager.save).not.toHaveBeenCalled();
    });
  });

  describe("createWithIdempotencyKey", () => {
    const useTransaction = (stored: unknown) => {
      const calls: string[] = [];
      Object.assign(txManager, {
        queryRunner: { isTransactionActive: true },
        query: jest.fn(async (sql: string) => {
          calls.push(sql.includes("hashtext($1))") ? "key-lock" : sql);
          return [];
        }),
        findOne: jest.fn().mockResolvedValue(stored),
        delete: jest.fn(),
        insert: jest.fn().mockResolvedValue({}),
      });
      subscriptionService.assertCanCreateProductInTx.mockImplementation(
        async () => {
          calls.push("quota");
        },
      );
      return calls;
    };

    it("takes the key lock before the quota lock and stores the response", async () => {
      const calls = useTransaction(null);

      const result = await service.createWithIdempotencyKey(
        { name: "Widget" } as any,
        mockUser,
        "key-1",
      );

      expect(calls).toEqual(["key-lock", "quota"]);
      expect(txManager.query.mock.calls[0][1][0]).toMatch(/^product:/);
      expect(result).toEqual({
        replayed: false,
        data: { id: "prod-1", name: "Widget", user_id: "user-1" },
      });
      expect(txManager.insert).toHaveBeenCalledTimes(1);
    });

    it("replays without checking the quota or inserting", async () => {
      const calls = useTransaction({
        id: "row-1",
        response: { id: "prod-1", name: "Widget" },
        expires_at: new Date(Date.now() + 60_000),
      });

      const result = await service.createWithIdempotencyKey(
        { name: "Widget" } as any,
        mockUser,
        "key-1",
      );

      expect(result).toEqual({
        replayed: true,
        data: { id: "prod-1", name: "Widget" },
      });
      expect(calls).toEqual(["key-lock"]);
      expect(txManager.save).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return paginated products", async () => {
      const result = await service.findAll({ limit: 10, offset: 0 }, mockUser);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(10);
    });

    it("should apply search filter", async () => {
      const qb = productsRepo.createQueryBuilder();

      await service.findAll(
        { limit: 10, offset: 0, search: "Widget" },
        mockUser,
      );

      expect(qb.andWhere).toHaveBeenCalled();
    });

    it("should apply custom sort", async () => {
      const qb = productsRepo.createQueryBuilder();

      await service.findAll(
        { limit: 10, offset: 0, sortBy: "name", sortOrder: SortOrder.ASC },
        mockUser,
      );

      expect(qb.orderBy).toHaveBeenCalledWith("product.name", "ASC");
    });
  });

  describe("findOne", () => {
    it("should return a product", async () => {
      productsRepo.findOne.mockResolvedValue(mockProduct);

      const result = await service.findOne("prod-1", mockUser);

      expect(result).toEqual(mockProduct);
    });

    it("should throw if product not found", async () => {
      productsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("unknown", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("update", () => {
    const updateQuery = () => queryBuilder;

    it("writes only the fields present in the body", async () => {
      productsRepo.findOne.mockResolvedValue({ ...mockProduct, name: "New" });

      const result = await service.update(
        "prod-1",
        { name: "New", supplier_id: null, sale_price_cents: undefined },
        mockUser,
      );

      expect(updateQuery().set).toHaveBeenCalledWith({
        name: "New",
        supplier_id: null,
      });
      expect(updateQuery().andWhere).toHaveBeenCalledWith("user_id = :userId", {
        userId: "user-1",
      });
      expect(updateQuery().andWhere).toHaveBeenCalledWith("deleted_at IS NULL");
      expect(updateQuery().andWhere).not.toHaveBeenCalledWith(
        "quantity = :expectedQuantity",
        expect.anything(),
      );
      expect(result.name).toBe("New");
    });

    it("conditions a quantity write on expectedQuantity", async () => {
      productsRepo.findOne.mockResolvedValue({ ...mockProduct, quantity: 15 });

      await service.update(
        "prod-1",
        { quantity: 15, expectedQuantity: 8 },
        mockUser,
      );

      expect(updateQuery().set).toHaveBeenCalledWith({ quantity: 15 });
      expect(updateQuery().andWhere).toHaveBeenCalledWith(
        "quantity = :expectedQuantity",
        { expectedQuantity: 8 },
      );
    });

    it.each([
      [{ quantity: 15 }],
      [{ expectedQuantity: 8 }],
      [{ quantity: null, expectedQuantity: 8 }],
    ])("rejects %p with VALIDATION_ERROR before querying", async (body) => {
      await expect(
        service.update("prod-1", body as any, mockUser),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
      });
      expect(productsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it.each([
      ["name"],
      ["purchase_price_cents"],
      ["sale_price_cents"],
      ["currency"],
    ])(
      "rejects null %s with VALIDATION_ERROR instead of a NOT NULL failure",
      async (field) => {
        await expect(
          service.update("prod-1", { [field]: null } as any, mockUser),
        ).rejects.toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect(productsRepo.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it("rejects a null quantity even with expectedQuantity", async () => {
      await expect(
        service.update(
          "prod-1",
          { quantity: null, expectedQuantity: 8 } as any,
          mockUser,
        ),
      ).rejects.toMatchObject({ errorCode: "VALIDATION_ERROR" });
      expect(productsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("returns 409 when the row exists but the stock moved", async () => {
      updateQuery().execute.mockResolvedValue({ affected: 0 });
      productsRepo.findOne.mockResolvedValue({ ...mockProduct, quantity: 8 });

      await expect(
        service.update(
          "prod-1",
          { quantity: 15, expectedQuantity: 10 },
          mockUser,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "PRODUCT_QUANTITY_CONFLICT",
      });
    });

    it("returns 404 when no row matched and the product is gone", async () => {
      updateQuery().execute.mockResolvedValue({ affected: 0 });
      productsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update("unknown", { name: "New" }, mockUser),
      ).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "PRODUCT_NOT_FOUND",
      });
    });

    it("an empty body changes nothing and returns the product", async () => {
      productsRepo.findOne.mockResolvedValue(mockProduct);

      await expect(service.update("prod-1", {}, mockUser)).resolves.toEqual(
        mockProduct,
      );
      expect(productsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should soft delete product", async () => {
      productsRepo.findOne.mockResolvedValue(mockProduct);

      await service.remove("prod-1", mockUser);

      expect(productsRepo.softDelete).toHaveBeenCalledWith({
        id: "prod-1",
        user_id: "user-1",
      });
    });

    it("should throw if product not found", async () => {
      productsRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("prod-1", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("removeBulk", () => {
    it("should delete multiple products and track skipped", async () => {
      productsRepo.findOne
        .mockResolvedValueOnce(mockProduct) // prod-1 found
        .mockResolvedValueOnce(null); // prod-2 not found → skipped

      const result = await service.removeBulk(["prod-1", "prod-2"], mockUser);

      expect(result.deleted).toBe(1);
      expect(result.skipped).toContain("prod-2");
      expect(productsRepo.softDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("getLowStockProducts", () => {
    it("should return products below threshold", async () => {
      const result = await service.getLowStockProducts(mockUser, 10);

      expect(result).toBeDefined();
      expect(productsRepo.createQueryBuilder).toHaveBeenCalled();
    });

    it("should default to threshold of 10", async () => {
      const qb = productsRepo.createQueryBuilder();

      await service.getLowStockProducts(mockUser);

      expect(qb.andWhere).toHaveBeenCalledWith(
        "product.quantity <= :threshold",
        { threshold: 10 },
      );
    });
  });

  describe("getInventoryValue", () => {
    it("maps the aggregate to numbers and scopes to the user", async () => {
      const qb = productsRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue({
        purchaseValueCents: "150000",
        saleValueCents: "250000",
        totalUnits: "80",
        productCount: "3",
      });

      const result = await service.getInventoryValue(mockUser);

      expect(result).toEqual({
        currency: "UAH",
        purchaseValueCents: 150000,
        saleValueCents: 250000,
        totalUnits: 80,
        productCount: 3,
      });
      expect(qb.where).toHaveBeenCalledWith("product.user_id = :userId", {
        userId: mockUser.id,
      });
    });

    it("returns zeros when the user has no products", async () => {
      const qb = productsRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue(undefined);

      const result = await service.getInventoryValue(mockUser);

      expect(result).toEqual({
        currency: "UAH",
        purchaseValueCents: 0,
        saleValueCents: 0,
        totalUnits: 0,
        productCount: 0,
      });
    });
  });
});
