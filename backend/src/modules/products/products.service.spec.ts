import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken, getDataSourceToken } from "@nestjs/typeorm";
import { ProductsService } from "./products.service";
import { Product } from "./entities/product.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { SortOrder } from "../../common/dto/pagination.dto";
import { SubscriptionService } from "../subscription/subscription.service";

describe("ProductsService", () => {
  let service: ProductsService;
  let productsRepo: any;
  let dataSource: any;
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
      getManyAndCount: jest.fn().mockResolvedValue([[mockProduct], 1]),
      getMany: jest.fn().mockResolvedValue([mockProduct]),
    };

    productsRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "prod-1", ...data })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

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
        {
          provide: SubscriptionService,
          useValue: { assertCanCreateProduct: jest.fn() },
        },
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

      expect(productsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ...dto, user_id: "user-1" }),
      );
      expect(productsRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
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
    it("should update a product", async () => {
      productsRepo.findOne.mockResolvedValue({ ...mockProduct });

      const _result = await service.update(
        "prod-1",
        { name: "Updated Widget" } as any,
        mockUser,
      );

      expect(productsRepo.save).toHaveBeenCalled();
    });

    it("should throw if product not found", async () => {
      productsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update("unknown", { name: "New" } as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
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
});
