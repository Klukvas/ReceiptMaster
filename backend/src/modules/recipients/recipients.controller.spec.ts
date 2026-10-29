import { RecipientsController } from "./recipients.controller";
import { RecipientsService } from "./recipients.service";
import { User } from "../users/entities/user.entity";

describe("RecipientsController", () => {
  let controller: RecipientsController;
  let recipientsService: jest.Mocked<RecipientsService>;
  const mockUser = { id: "user-1" } as User;
  const mockReq = { user: mockUser };

  const mockRecipient = {
    id: "rec-1",
    name: "John Doe",
    email: "john@test.com",
    user_id: "user-1",
  };

  beforeEach(() => {
    recipientsService = {
      create: jest.fn().mockResolvedValue(mockRecipient),
      findAll: jest.fn().mockResolvedValue({
        data: [mockRecipient],
        total: 1,
        offset: 0,
        limit: 10,
      }),
      findOne: jest.fn().mockResolvedValue(mockRecipient),
      update: jest
        .fn()
        .mockResolvedValue({ ...mockRecipient, name: "Updated" }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new RecipientsController(recipientsService);
  });

  describe("create", () => {
    const response = () => ({ setHeader: jest.fn() }) as any;
    const withKey = (key: string | undefined) => ({
      user: mockUser,
      headers: key === undefined ? {} : { "idempotency-key": key },
    });

    it("should create a recipient", () => {
      const dto = { name: "John", email: "john@test.com" } as any;

      controller.create(dto, withKey(undefined), response());

      expect(recipientsService.create).toHaveBeenCalledWith(dto, mockUser);
    });

    it("passes an Idempotency-Key through and marks a replay", async () => {
      const dto = { name: "John" } as any;
      const res = response();
      recipientsService.createWithIdempotencyKey = jest
        .fn()
        .mockResolvedValue({ replayed: true, data: mockRecipient });

      const body = await controller.create(dto, withKey("key-1"), res);

      expect(recipientsService.createWithIdempotencyKey).toHaveBeenCalledWith(
        dto,
        mockUser,
        "key-1",
      );
      expect(recipientsService.create).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith(
        "X-Idempotency-Replayed",
        "true",
      );
      expect(body).toEqual(mockRecipient);
    });

    it("does not mark a first create with a key as replayed", async () => {
      const res = response();
      recipientsService.createWithIdempotencyKey = jest
        .fn()
        .mockResolvedValue({ replayed: false, data: mockRecipient });

      await controller.create({ name: "John" } as any, withKey("key-1"), res);

      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return paginated recipients", () => {
      const pagination = { limit: 10, offset: 0 };

      controller.findAll(pagination as any, mockReq);

      expect(recipientsService.findAll).toHaveBeenCalledWith(
        pagination,
        mockUser,
      );
    });
  });

  describe("findOne", () => {
    it("should find a recipient by id", () => {
      controller.findOne("rec-1", mockReq);

      expect(recipientsService.findOne).toHaveBeenCalledWith("rec-1", mockUser);
    });
  });

  describe("update", () => {
    it("should update a recipient", () => {
      const dto = { name: "Updated Name" } as any;

      controller.update("rec-1", dto, mockReq);

      expect(recipientsService.update).toHaveBeenCalledWith(
        "rec-1",
        dto,
        mockUser,
      );
    });
  });

  describe("remove", () => {
    it("should remove a recipient", () => {
      controller.remove("rec-1", mockReq);

      expect(recipientsService.remove).toHaveBeenCalledWith("rec-1", mockUser);
    });
  });
});
