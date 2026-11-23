import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SuppliersService } from "./suppliers.service";
import { Supplier } from "./entities/supplier.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { SortOrder } from "../../common/dto/pagination.dto";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";

describe("SuppliersService", () => {
  let service: SuppliersService;
  let suppliersRepo: any;
  let txManager: any;
  // What the managers read: the account's subscription row and a stored idempotency key.
  let subscription: { plan: string } | null;
  let storedKey: unknown;
  const mockUser = { id: "user-1" } as User;

  const mockSupplier: Partial<Supplier> = {
    id: "sup-1",
    name: "Test Supplier",
    email: "supplier@test.com",
    phone: "+380001234567",
    contact_person: "John Contact",
    user_id: "user-1",
  };

  const mockProduct = { id: "prod-1", name: "Product A", user_id: "user-1" };

  beforeEach(async () => {
    const mockQueryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities: [mockSupplier],
        raw: [{ product_count: "2" }],
      }),
      getCount: jest.fn().mockResolvedValue(1),
    };

    suppliersRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "sup-1", ...data })),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    subscription = { plan: "business" };
    storedKey = null;
    const findOne = (entity: unknown) =>
      Promise.resolve(entity === UserSubscription ? subscription : storedKey);

    txManager = {
      queryRunner: { isTransactionActive: true },
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(findOne),
      delete: jest.fn(),
      insert: jest.fn().mockResolvedValue({}),
      getRepository: jest.fn().mockReturnValue(suppliersRepo),
      save: jest.fn((data) => Promise.resolve({ id: "sup-1", ...data })),
    };
    suppliersRepo.manager = {
      findOne: jest.fn(findOne),
      transaction: jest.fn((work) => work(txManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: getRepositoryToken(Supplier), useValue: suppliersRepo },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
  });

  describe("create", () => {
    it("should create a supplier without products", async () => {
      const dto = { name: "New Supplier", email: "new@test.com" };

      const result = await service.create(dto as any, mockUser);

      expect(suppliersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Supplier", user_id: "user-1" }),
      );
      expect(result).toBeDefined();
    });

    it("does not link products: a product's supplier is set on the product", async () => {
      const dto = { name: "New Supplier", productIds: ["prod-1"] };

      await service.create(dto as any, mockUser);

      expect(suppliersRepo.save).toHaveBeenCalledWith(
        expect.not.objectContaining({ products: expect.anything() }),
      );
    });
  });

  describe("createWithIdempotencyKey", () => {
    const dto = { name: "New Supplier", contactPerson: "Ann" } as any;

    it("creates once under a supplier-scoped key and stores the fingerprint", async () => {
      const result = await service.createWithIdempotencyKey(
        dto,
        mockUser,
        "key-1",
      );

      expect(result).toMatchObject({
        replayed: false,
        data: { id: "sup-1", name: "New Supplier", contact_person: "Ann" },
      });
      expect(txManager.query.mock.calls[0][1][0]).toMatch(/^supplier:/);
      expect(txManager.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          user_id: "user-1",
          payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
    });

    it("replays the stored response without saving", async () => {
      storedKey = {
        id: "row-1",
        response: { id: "sup-1", name: "New Supplier" },
        payload_hash: null,
        expires_at: new Date(Date.now() + 60_000),
      };

      const result = await service.createWithIdempotencyKey(
        dto,
        mockUser,
        "key-1",
      );

      expect(result).toEqual({
        replayed: true,
        data: { id: "sup-1", name: "New Supplier" },
      });
      expect(txManager.save).not.toHaveBeenCalled();
    });

    it("replays the stored response after the plan lost suppliers", async () => {
      subscription = { plan: "free" };
      storedKey = {
        id: "row-1",
        response: { id: "sup-1", name: "New Supplier" },
        payload_hash: null,
        expires_at: new Date(Date.now() + 60_000),
      };

      const result = await service.createWithIdempotencyKey(
        dto,
        mockUser,
        "key-1",
      );

      expect(result.replayed).toBe(true);
    });

    it("refuses when the body differs from the first request", async () => {
      storedKey = {
        id: "row-1",
        response: { id: "sup-1" },
        payload_hash: "0".repeat(64),
        expires_at: new Date(Date.now() + 60_000),
      };

      await expect(
        service.createWithIdempotencyKey(dto, mockUser, "key-1"),
      ).rejects.toMatchObject({
        statusCode: 422,
        errorCode: "IDEMPOTENCY_KEY_REUSED",
      });
      expect(txManager.save).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return paginated suppliers with product count", async () => {
      const result = await service.findAll({ limit: 10, offset: 0 }, mockUser);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty("product_count", 2);
      expect(result.total).toBe(1);
    });

    it("should apply search filter", async () => {
      const qb = suppliersRepo.createQueryBuilder();

      await service.findAll({ limit: 10, offset: 0, search: "Test" }, mockUser);

      expect(qb.andWhere).toHaveBeenCalled();
    });

    it("should apply custom sort", async () => {
      const qb = suppliersRepo.createQueryBuilder();

      await service.findAll(
        { limit: 10, offset: 0, sortBy: "name", sortOrder: SortOrder.ASC },
        mockUser,
      );

      expect(qb.orderBy).toHaveBeenCalledWith("supplier.name", "ASC");
    });

    it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
      "ignores the inherited sort key %s and sorts by the default",
      async (sortBy) => {
        const qb = suppliersRepo.createQueryBuilder();
        const before = Object.getOwnPropertyNames(Object.prototype).sort();

        await service.findAll({ limit: 10, offset: 0, sortBy }, mockUser);

        expect(qb.orderBy).toHaveBeenCalledWith(
          "supplier.created_at",
          expect.any(String),
        );
        expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(
          before,
        );
      },
    );
  });

  describe("findOne", () => {
    it("should return a supplier with products", async () => {
      suppliersRepo.findOne.mockResolvedValue({
        ...mockSupplier,
        products: [mockProduct],
      });

      const result = await service.findOne("sup-1", mockUser);

      expect(result).toBeDefined();
      expect(suppliersRepo.findOne).toHaveBeenCalledWith({
        where: { id: "sup-1", user_id: "user-1" },
        relations: ["products"],
      });
    });

    it("should throw if supplier not found", async () => {
      suppliersRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("unknown", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("update", () => {
    it("should update supplier fields", async () => {
      suppliersRepo.findOne.mockResolvedValue({
        ...mockSupplier,
        products: [],
      });

      await service.update("sup-1", { name: "Updated" } as any, mockUser);

      expect(suppliersRepo.save).toHaveBeenCalled();
    });

    it("should throw if supplier not found", async () => {
      suppliersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update("unknown", { name: "Test" } as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("plan feature", () => {
    const restricted = {
      statusCode: 402,
      errorCode: "PLAN_FEATURE_RESTRICTED",
      details: { feature: "suppliers" },
    };

    it.each([
      ["the free plan", { plan: "free" }],
      ["an account without a subscription row", null],
    ])("refuses creating and updating on %s", async (_name, row) => {
      subscription = row;
      suppliersRepo.findOne.mockResolvedValue({ ...mockSupplier });

      await expect(
        service.create({ name: "S" } as any, mockUser),
      ).rejects.toMatchObject(restricted);
      await expect(
        service.createWithIdempotencyKey({ name: "S" } as any, mockUser, "k"),
      ).rejects.toMatchObject(restricted);
      await expect(
        service.update("sup-1", { name: "Updated" } as any, mockUser),
      ).rejects.toMatchObject(restricted);
      expect(suppliersRepo.save).not.toHaveBeenCalled();
      expect(txManager.save).not.toHaveBeenCalled();
    });

    it("still lists, reads and deletes on the free plan", async () => {
      subscription = { plan: "free" };
      suppliersRepo.findOne.mockResolvedValue({ ...mockSupplier });

      await expect(service.findAll({}, mockUser)).resolves.toMatchObject({
        total: 1,
      });
      await expect(service.findOne("sup-1", mockUser)).resolves.toBeDefined();
      await service.remove("sup-1", mockUser);

      expect(suppliersRepo.remove).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should delete supplier", async () => {
      suppliersRepo.findOne.mockResolvedValue({
        ...mockSupplier,
        products: [],
      });

      await service.remove("sup-1", mockUser);

      expect(suppliersRepo.remove).toHaveBeenCalled();
    });

    it("should throw if supplier not found", async () => {
      suppliersRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("unknown", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });
});
