import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { User } from "../users/entities/user.entity";

describe("ProductsController", () => {
  let controller: ProductsController;
  let productsService: jest.Mocked<ProductsService>;
  const mockUser = { id: "user-1" } as User;
  const mockReq = { user: mockUser };

  const mockProduct = {
    id: "prod-1",
    name: "Widget",
    purchase_price_cents: 500,
    sale_price_cents: 1000,
    quantity: 50,
    user_id: "user-1",
  };

  beforeEach(() => {
    productsService = {
      create: jest.fn().mockResolvedValue(mockProduct),
      findAll: jest.fn().mockResolvedValue({
        data: [mockProduct],
        total: 1,
        offset: 0,
        limit: 10,
      }),
      findOne: jest.fn().mockResolvedValue(mockProduct),
      update: jest.fn().mockResolvedValue({ ...mockProduct, name: "Updated" }),
      remove: jest.fn().mockResolvedValue(undefined),
      removeBulk: jest.fn().mockResolvedValue({ deleted: 2, skipped: [] }),
      getLowStockProducts: jest.fn().mockResolvedValue([mockProduct]),
    } as any;

    controller = new ProductsController(productsService);
  });

  describe("create", () => {
    it("should create a product", () => {
      const dto = { name: "Widget", sale_price_cents: 1000 } as any;

      controller.create(dto, mockReq);

      expect(productsService.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe("findAll", () => {
    it("should return paginated products", () => {
      const pagination = { limit: 10, offset: 0 };

      controller.findAll(pagination as any, mockReq);

      expect(productsService.findAll).toHaveBeenCalledWith(
        pagination,
        mockUser,
      );
    });
  });

  describe("getLowStock", () => {
    it("should call getLowStockProducts with parsed threshold", () => {
      controller.getLowStock(mockReq, "5");

      expect(productsService.getLowStockProducts).toHaveBeenCalledWith(
        mockUser,
        5,
        50,
      );
    });

    it("should default to threshold 10", () => {
      controller.getLowStock(mockReq, undefined);

      expect(productsService.getLowStockProducts).toHaveBeenCalledWith(
        mockUser,
        10,
        50,
      );
    });
  });

  describe("findOne", () => {
    it("should find a product by id", () => {
      controller.findOne("prod-1", mockReq);

      expect(productsService.findOne).toHaveBeenCalledWith("prod-1", mockUser);
    });
  });

  describe("update", () => {
    it("should update a product", () => {
      const dto = { name: "Updated Widget" } as any;

      controller.update("prod-1", dto, mockReq);

      expect(productsService.update).toHaveBeenCalledWith(
        "prod-1",
        dto,
        mockUser,
      );
    });
  });

  describe("removeBulk", () => {
    it("should bulk delete products", () => {
      controller.removeBulk({ ids: ["prod-1", "prod-2"] }, mockReq);

      expect(productsService.removeBulk).toHaveBeenCalledWith(
        ["prod-1", "prod-2"],
        mockUser,
      );
    });
  });

  describe("remove", () => {
    it("should remove a product", () => {
      controller.remove("prod-1", mockReq);

      expect(productsService.remove).toHaveBeenCalledWith("prod-1", mockUser);
    });
  });
});
