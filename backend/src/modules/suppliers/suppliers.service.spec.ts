import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SuppliersService } from "./suppliers.service";
import { Supplier } from "./entities/supplier.entity";
import { Product } from "../products/entities/product.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { SortOrder } from "../../common/dto/pagination.dto";

describe("SuppliersService", () => {
  let service: SuppliersService;
  let suppliersRepo: any;
  let productsRepo: any;
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

    productsRepo = {
      findBy: jest.fn().mockResolvedValue([mockProduct]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: getRepositoryToken(Supplier), useValue: suppliersRepo },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
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

    it("should create a supplier with products", async () => {
      const dto = {
        name: "New Supplier",
        productIds: ["prod-1"],
      };

      await service.create(dto as any, mockUser);

      expect(productsRepo.findBy).toHaveBeenCalled();
      expect(suppliersRepo.save).toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return paginated suppliers with product count", async () => {
      const result = await service.findAll(
        { limit: 10, offset: 0 },
        mockUser,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty("product_count", 2);
      expect(result.total).toBe(1);
    });

    it("should apply search filter", async () => {
      const qb = suppliersRepo.createQueryBuilder();

      await service.findAll(
        { limit: 10, offset: 0, search: "Test" },
        mockUser,
      );

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

    it("should update supplier products", async () => {
      suppliersRepo.findOne.mockResolvedValue({
        ...mockSupplier,
        products: [],
      });

      await service.update(
        "sup-1",
        { productIds: ["prod-1"] } as any,
        mockUser,
      );

      expect(productsRepo.findBy).toHaveBeenCalled();
      expect(suppliersRepo.save).toHaveBeenCalled();
    });

    it("should throw if supplier not found", async () => {
      suppliersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update("unknown", { name: "Test" } as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
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
