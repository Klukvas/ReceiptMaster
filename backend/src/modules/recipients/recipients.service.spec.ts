import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RecipientsService } from "./recipients.service";
import { Recipient } from "./entities/recipient.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { SortOrder } from "../../common/dto/pagination.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";

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

  describe("createWithIdempotencyKey", () => {
    const transactionManager = (stored: unknown) => ({
      queryRunner: { isTransactionActive: true },
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(stored),
      delete: jest.fn(),
      insert: jest.fn().mockResolvedValue({}),
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "rec-new", ...data })),
    });

    it("creates the recipient and stores the response under the recipient scope", async () => {
      const manager = transactionManager(null);
      recipientsRepo.manager = {
        transaction: jest.fn((run) => run(manager)),
      };

      const result = await service.createWithIdempotencyKey(
        { name: "Jane" } as any,
        mockUser,
        "key-1",
      );

      expect(result).toEqual({
        replayed: false,
        data: { id: "rec-new", name: "Jane", user_id: "user-1" },
      });
      expect(manager.query.mock.calls[0][1][0]).toMatch(/^recipient:/);
      expect(manager.insert).toHaveBeenCalledTimes(1);
    });

    it("replays a stored response without saving a second recipient", async () => {
      const manager = transactionManager({
        id: "row-1",
        response: { id: "rec-1", name: "Jane" },
        expires_at: new Date(Date.now() + 60_000),
      });
      recipientsRepo.manager = {
        transaction: jest.fn((run) => run(manager)),
      };

      const result = await service.createWithIdempotencyKey(
        { name: "Jane" } as any,
        mockUser,
        "key-1",
      );

      expect(result).toEqual({
        replayed: true,
        data: { id: "rec-1", name: "Jane" },
      });
      expect(manager.save).not.toHaveBeenCalled();
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

    it("rejects a null name with 400 before touching the database", async () => {
      await expect(
        service.update(
          "rec-1",
          { name: null } as unknown as UpdateRecipientDto,
          mockUser,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        error: "Validation error for name: name cannot be null",
      });
      expect(recipientsRepo.findOne).not.toHaveBeenCalled();
      expect(recipientsRepo.save).not.toHaveBeenCalled();
    });

    it.each(["email", "phone", "address"])(
      "still clears %s with null",
      async (field) => {
        recipientsRepo.findOne.mockResolvedValue({ ...mockRecipient });

        await service.update(
          "rec-1",
          { [field]: null } as UpdateRecipientDto,
          mockUser,
        );

        expect(recipientsRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ [field]: null, name: "John Doe" }),
        );
      },
    );
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
