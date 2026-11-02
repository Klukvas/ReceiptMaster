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
      update: jest.fn().mockResolvedValue({ ...mockSupplier, name: "Updated" }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new SuppliersController(suppliersService);
  });

  describe("create", () => {
    const response = () => ({ setHeader: jest.fn() }) as any;
    const withKey = (key: string | undefined) => ({
      user: mockUser,
      headers: key === undefined ? {} : { "idempotency-key": key },
    });

    it("passes an Idempotency-Key through and marks a replay", async () => {
      const dto = { name: "Test" } as any;
      const res = response();
      const stored = { id: "sup-1", name: "Test" };
      suppliersService.createWithIdempotencyKey = jest
        .fn()
        .mockResolvedValue({ replayed: true, data: stored });

      const body = await controller.create(dto, withKey("key-1"), res);

      expect(suppliersService.createWithIdempotencyKey).toHaveBeenCalledWith(
        dto,
        mockUser,
        "key-1",
      );
      expect(suppliersService.create).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith(
        "X-Idempotency-Replayed",
        "true",
      );
      expect(body).toEqual(stored);
    });

    it("does not mark a first create with a key as replayed", async () => {
      const res = response();
      suppliersService.createWithIdempotencyKey = jest
        .fn()
        .mockResolvedValue({ replayed: false, data: { id: "sup-1" } });

      await controller.create({ name: "T" } as any, withKey("key-1"), res);

      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it("rejects an invalid key with 400 before touching the service", async () => {
      await expect(
        controller.create(
          { name: "T" } as any,
          withKey("two words"),
          response(),
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(suppliersService.create).not.toHaveBeenCalled();
    });

    it("should create a supplier", async () => {
      const dto = { name: "Test", email: "test@test.com" } as any;

      const result = await controller.create(
        dto,
        withKey(undefined),
        response(),
      );

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
