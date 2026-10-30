import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { UsersService } from "./users.service";
import { User } from "./entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { hashRefreshToken } from "./refresh-tokens";

jest.mock("bcrypt");

// Token persistence and rotation run against PostgreSQL in
// test/refresh-rotation.e2e-spec.ts and test/refresh-token-security.e2e-spec.ts;
// these mocks only cover the service's own validation and wiring.
describe("UsersService", () => {
  let service: UsersService;
  let userRepo: any;
  let refreshTokenRepo: any;
  let tokenStore: any;
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
    txTokenRepo = { update: jest.fn() };
    txManager = {
      update: jest.fn(),
      getRepository: jest.fn().mockReturnValue(txTokenRepo),
    };
    userRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ id: "user-1", ...data })),
      update: jest.fn(),
      manager: { transaction: jest.fn((work) => work(txManager)) },
    };
    tokenStore = { insert: jest.fn() };
    refreshTokenRepo = {
      update: jest.fn(),
      manager: {
        transaction: jest.fn(),
        getRepository: jest.fn().mockReturnValue(tokenStore),
        createQueryBuilder: jest.fn(),
      },
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
      expect(result.refresh_token).toMatch(/^[a-f0-9]{128}$/);
      expect(result.user.email).toBe("new@test.com");
      expect(userRepo.create).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalled();
      expect(tokenStore.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          token_hash: hashRefreshToken(result.refresh_token),
          family_id: expect.any(String),
        }),
      );
      expect(tokenStore.insert.mock.calls[0][0]).not.toHaveProperty("token");
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
    it.each([undefined, null, "", 1, {}, [], "x".repeat(128), "a".repeat(127)])(
      "rejects malformed token %p before querying",
      async (malformed) => {
        await expect(service.refreshToken(malformed as string)).rejects.toThrow(
          ApiErrorResponse,
        );
        expect(refreshTokenRepo.manager.transaction).not.toHaveBeenCalled();
      },
    );
  });

  describe("revokeRefreshToken", () => {
    it("rejects a malformed token before querying", async () => {
      await expect(service.revokeRefreshToken("x".repeat(128))).rejects.toThrow(
        ApiErrorResponse,
      );
      expect(
        refreshTokenRepo.manager.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });
  });

  describe("revokeAllUserTokens", () => {
    it("revokes every live token of the user", async () => {
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

      expect(userRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(txManager.update).toHaveBeenCalledWith(User, "user-1", {
        password: "new-hashed-pw",
      });
      expect(txManager.getRepository).toHaveBeenCalledWith(RefreshToken);
      expect(txTokenRepo.update).toHaveBeenCalledWith(
        { user_id: "user-1", revoked: false },
        { revoked: true },
      );
      expect(userRepo.update).not.toHaveBeenCalled();
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
