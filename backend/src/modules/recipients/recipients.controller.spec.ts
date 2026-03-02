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
    it("should create a recipient", () => {
      const dto = { name: "John", email: "john@test.com" } as any;

      controller.create(dto, mockReq);

      expect(recipientsService.create).toHaveBeenCalledWith(dto, mockUser);
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
