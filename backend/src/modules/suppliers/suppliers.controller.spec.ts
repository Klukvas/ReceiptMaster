import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { User } from "../users/entities/user.entity";

describe("SuppliersController", () => {
  let controller: SuppliersController;
  let suppliersService: jest.Mocked<SuppliersService>;
  const mockUser = { id: "user-1" } as User;
  const mockReq = { user: mockUser };

  const mockSupplier = {
    id: "sup-1",
    name: "Test Supplier",
    email: "supplier@test.com",
    user_id: "user-1",
  };

  beforeEach(() => {
    suppliersService = {
      create: jest.fn().mockResolvedValue(mockSupplier),
      findAll: jest.fn().mockResolvedValue({
        data: [mockSupplier],
        total: 1,
        offset: 0,
        limit: 10,
      }),
      findOne: jest.fn().mockResolvedValue(mockSupplier),
      update: jest
        .fn()
        .mockResolvedValue({ ...mockSupplier, name: "Updated" }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new SuppliersController(suppliersService);
  });

  describe("create", () => {
    it("should create a supplier", async () => {
      const dto = { name: "Test", email: "test@test.com" } as any;

      const result = await controller.create(dto, mockReq);

      expect(suppliersService.create).toHaveBeenCalledWith(dto, mockUser);
      expect(result).toEqual(mockSupplier);
    });
  });

  describe("findAll", () => {
    it("should return paginated suppliers", async () => {
      const pagination = { limit: 10, offset: 0 };

      const result = await controller.findAll(pagination as any, mockReq);

      expect(suppliersService.findAll).toHaveBeenCalledWith(
        pagination,
        mockUser,
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe("findOne", () => {
    it("should find a supplier by id", async () => {
      const result = await controller.findOne("sup-1", mockReq);

      expect(suppliersService.findOne).toHaveBeenCalledWith("sup-1", mockUser);
      expect(result).toEqual(mockSupplier);
    });
  });

  describe("update", () => {
    it("should update a supplier", async () => {
      const dto = { name: "Updated Name" } as any;

      const result = await controller.update("sup-1", dto, mockReq);

      expect(suppliersService.update).toHaveBeenCalledWith(
        "sup-1",
        dto,
        mockUser,
      );
      expect(result.name).toBe("Updated");
    });
  });

  describe("remove", () => {
    it("should remove a supplier", async () => {
      await controller.remove("sup-1", mockReq);

      expect(suppliersService.remove).toHaveBeenCalledWith("sup-1", mockUser);
    });
  });
});
