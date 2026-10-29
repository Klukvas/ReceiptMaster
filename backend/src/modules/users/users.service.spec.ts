import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { UsersService } from "./users.service";
import { User } from "./entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";

jest.mock("bcrypt");

describe("UsersService", () => {
  let service: UsersService;
  let userRepo: any;
  let refreshTokenRepo: any;
  let redeemQuery: any;
  let txTokenRepo: any;
  let txManager: any;
  let _jwtService: jest.Mocked<JwtService>;

  const mockUser: Partial<User> = {
    id: "user-1",
    email: "test@test.com",
    password: "hashed-password",
    isActive: true,
  };

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "user-1", ...data })),
      update: jest.fn(),
    };

    redeemQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ user_id: "user-1" }] }),
    };
    txTokenRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve(data)),
    };
    txManager = {
      createQueryBuilder: jest.fn().mockReturnValue(redeemQuery),
      findOne: jest.fn().mockResolvedValue(mockUser),
      getRepository: jest.fn().mockReturnValue(txTokenRepo),
    };
    refreshTokenRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve(data)),
      findOne: jest.fn(),
      update: jest.fn(),
      manager: { transaction: jest.fn((work) => work(txManager)) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue("jwt-token") },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    _jwtService = module.get(JwtService);
  });

  describe("register", () => {
    it("should register a new user and return tokens", async () => {
      userRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-pw");

      const result = await service.register({
        email: "new@test.com",
        password: "Password123!",
      });

      expect(result.access_token).toBe("jwt-token");
      expect(result.refresh_token).toBeDefined();
      expect(result.user.email).toBe("new@test.com");
      expect(userRepo.create).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalled();
    });

    it("should throw if user already exists", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({ email: "test@test.com", password: "pw" }),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("login", () => {
    it("should login and return tokens", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: "test@test.com",
        password: "correct-pw",
      });

      expect(result.access_token).toBe("jwt-token");
      expect(result.user.id).toBe("user-1");
    });

    it("should throw if user not found", async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: "unknown@test.com", password: "pw" }),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if user is not active", async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        service.login({ email: "test@test.com", password: "pw" }),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if password is invalid", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: "test@test.com", password: "wrong" }),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("refreshToken", () => {
    const token = "a".repeat(128);

    it.each([undefined, null, "", 1, {}, [], "x".repeat(128), "a".repeat(127)])(
      "rejects malformed token %p before querying",
      async (malformed) => {
        await expect(service.refreshToken(malformed as string)).rejects.toThrow(
          ApiErrorResponse,
        );
        expect(refreshTokenRepo.manager.transaction).not.toHaveBeenCalled();
        expect(refreshTokenRepo.findOne).not.toHaveBeenCalled();
      },
    );

    it("redeems the token with one conditional UPDATE and issues a successor in the same transaction", async () => {
      const result = await service.refreshToken(token);

      expect(redeemQuery.set).toHaveBeenCalledWith({ revoked: true });
      expect(redeemQuery.where).toHaveBeenCalledWith("token = :token", {
        token,
      });
      expect(redeemQuery.andWhere).toHaveBeenCalledWith("revoked = false");
      expect(redeemQuery.andWhere).toHaveBeenCalledWith("expires_at > :now", {
        now: expect.any(Date),
      });
      expect(redeemQuery.returning).toHaveBeenCalledWith(["user_id"]);
      expect(txManager.getRepository).toHaveBeenCalledWith(RefreshToken);
      expect(txTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          token: expect.stringMatching(/^[a-f0-9]{128}$/),
        }),
      );
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        access_token: "jwt-token",
        refresh_token: expect.stringMatching(/^[a-f0-9]{128}$/),
        user: { id: "user-1", email: "test@test.com" },
      });
    });

    it("answers 401 UNAUTHORIZED without a successor when no live token matched", async () => {
      redeemQuery.execute.mockResolvedValue({ raw: [] });

      await expect(service.refreshToken(token)).rejects.toMatchObject({
        statusCode: 401,
        error: "Unauthorized access",
        errorCode: "UNAUTHORIZED",
      });
      expect(txTokenRepo.save).not.toHaveBeenCalled();
    });

    it("propagates a successor insert failure out of the transaction", async () => {
      txTokenRepo.save.mockRejectedValue(new Error("insert failed"));

      await expect(service.refreshToken(token)).rejects.toThrow(
        "insert failed",
      );
    });

    it("answers 401 when the token owner no longer exists", async () => {
      txManager.findOne.mockResolvedValue(null);

      await expect(service.refreshToken(token)).rejects.toMatchObject({
        errorCode: "UNAUTHORIZED",
      });
      expect(txTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("revokeRefreshToken", () => {
    it("should revoke a specific refresh token", async () => {
      await service.revokeRefreshToken("c".repeat(128));

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { token: "c".repeat(128) },
        { revoked: true },
      );
    });
  });

  describe("revokeAllUserTokens", () => {
    it("should revoke all user tokens", async () => {
      await service.revokeAllUserTokens("user-1");

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { user_id: "user-1", revoked: false },
        { revoked: true },
      );
    });
  });

  describe("findById", () => {
    it("should return user by id", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findById("user-1");

      expect(result).toEqual(mockUser);
    });

    it("should return null if not found", async () => {
      userRepo.findOne.mockResolvedValue(null);

      const result = await service.findById("unknown");

      expect(result).toBeNull();
    });
  });

  describe("findByEmail", () => {
    it("should return user by email", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail("test@test.com");

      expect(result).toEqual(mockUser);
    });
  });

  describe("updateProfile", () => {
    it("should update user email", async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null) // check for existing email
        .mockResolvedValueOnce({ ...mockUser, email: "new@test.com" });

      const result = await service.updateProfile("user-1", {
        email: "new@test.com",
      });

      expect(result.email).toBe("new@test.com");
      expect(result).not.toHaveProperty("password");
    });

    it("should throw if email is taken by another user", async () => {
      userRepo.findOne.mockResolvedValue({
        id: "other-user",
        email: "taken@test.com",
      });

      await expect(
        service.updateProfile("user-1", { email: "taken@test.com" }),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should allow keeping the same email", async () => {
      userRepo.findOne
        .mockResolvedValueOnce({ ...mockUser }) // same user owns email
        .mockResolvedValueOnce({ ...mockUser });

      const result = await service.updateProfile("user-1", {
        email: "test@test.com",
      });

      expect(result).toBeDefined();
    });
  });

  describe("changePassword", () => {
    it("should change password successfully", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true) // current password is valid
        .mockResolvedValueOnce(false); // new password is different
      (bcrypt.hash as jest.Mock).mockResolvedValue("new-hashed-pw");

      await service.changePassword("user-1", {
        currentPassword: "old-pw",
        newPassword: "new-pw",
        confirmPassword: "new-pw",
      });

      expect(userRepo.update).toHaveBeenCalledWith("user-1", {
        password: "new-hashed-pw",
      });
    });

    it("should throw if passwords do not match", async () => {
      await expect(
        service.changePassword("user-1", {
          currentPassword: "old",
          newPassword: "new1",
          confirmPassword: "new2",
        }),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if user not found", async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.changePassword("user-1", {
          currentPassword: "old",
          newPassword: "new",
          confirmPassword: "new",
        }),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if current password is wrong", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.changePassword("user-1", {
          currentPassword: "wrong",
          newPassword: "new",
          confirmPassword: "new",
        }),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if new password same as old", async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true) // current password valid
        .mockResolvedValueOnce(true); // new password same as old

      await expect(
        service.changePassword("user-1", {
          currentPassword: "same",
          newPassword: "same",
          confirmPassword: "same",
        }),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });
});
