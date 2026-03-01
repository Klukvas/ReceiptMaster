import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RecipientsService } from "./recipients.service";
import { Recipient } from "./entities/recipient.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { SortOrder } from "../../common/dto/pagination.dto";

describe("RecipientsService", () => {
  let service: RecipientsService;
  let recipientsRepo: any;
  const mockUser = { id: "user-1" } as User;

  const mockRecipient: Partial<Recipient> = {
    id: "rec-1",
    name: "John Doe",
    email: "john@test.com",
    phone: "+380001234567",
    user_id: "user-1",
  };

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
        entities: [mockRecipient],
        raw: [{ total_spent_cents: "5000", order_count: "3" }],
      }),
      getCount: jest.fn().mockResolvedValue(1),
    };

    recipientsRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "rec-1", ...data })),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientsService,
        { provide: getRepositoryToken(Recipient), useValue: recipientsRepo },
      ],
    }).compile();

    service = module.get<RecipientsService>(RecipientsService);
  });

  describe("create", () => {
    it("should create a recipient", async () => {
      const dto = { name: "Jane Doe", email: "jane@test.com" };

      const result = await service.create(dto as any, mockUser);

      expect(recipientsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ...dto, user_id: "user-1" }),
      );
      expect(result).toBeDefined();
    });
  });

  describe("findAll", () => {
    it("should return paginated recipients with aggregated data", async () => {
      const result = await service.findAll({ limit: 10, offset: 0 }, mockUser);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty("total_spent_cents", 5000);
      expect(result.data[0]).toHaveProperty("order_count", 3);
      expect(result.total).toBe(1);
    });

    it("should apply search filter across multiple fields", async () => {
      const qb = recipientsRepo.createQueryBuilder();

      await service.findAll({ limit: 10, offset: 0, search: "John" }, mockUser);

      expect(qb.andWhere).toHaveBeenCalled();
    });

    it("should apply custom sort", async () => {
      const qb = recipientsRepo.createQueryBuilder();

      await service.findAll(
        { limit: 10, offset: 0, sortBy: "name", sortOrder: SortOrder.ASC },
        mockUser,
      );

      expect(qb.orderBy).toHaveBeenCalledWith("recipient.name", "ASC");
    });
  });

  describe("findOne", () => {
    it("should return a recipient", async () => {
      recipientsRepo.findOne.mockResolvedValue(mockRecipient);

      const result = await service.findOne("rec-1", mockUser);

      expect(result).toEqual(mockRecipient);
    });

    it("should throw if recipient not found", async () => {
      recipientsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("unknown", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("update", () => {
    it("should update a recipient", async () => {
      recipientsRepo.findOne.mockResolvedValue({ ...mockRecipient });

      const _result = await service.update(
        "rec-1",
        { name: "Jane Doe" } as any,
        mockUser,
      );

      expect(recipientsRepo.save).toHaveBeenCalled();
    });

    it("should throw if recipient not found", async () => {
      recipientsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update("unknown", { name: "Test" } as any, mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("remove", () => {
    it("should delete recipient without orders", async () => {
      recipientsRepo.findOne.mockResolvedValue(mockRecipient);

      const deleteQb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      recipientsRepo.createQueryBuilder.mockReturnValue(deleteQb);

      await service.remove("rec-1", mockUser);

      expect(recipientsRepo.remove).toHaveBeenCalledWith(mockRecipient);
    });

    it("should throw if recipient has orders", async () => {
      recipientsRepo.findOne.mockResolvedValue(mockRecipient);

      const deleteQb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(5),
      };
      recipientsRepo.createQueryBuilder.mockReturnValue(deleteQb);

      await expect(service.remove("rec-1", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });
});
