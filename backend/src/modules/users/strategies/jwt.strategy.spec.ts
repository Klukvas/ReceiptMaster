import { JwtStrategy } from "./jwt.strategy";
import { ApiErrorResponse } from "../../../common/errors/ApiError";

// Mock passport-jwt
jest.mock("passport-jwt", () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn().mockReturnValue(() => "token"),
  },
  Strategy: class MockStrategy {
    constructor() {}
  },
}));

// Mock @nestjs/passport
jest.mock("@nestjs/passport", () => ({
  PassportStrategy: (strategy: any) => {
    return class extends strategy {
      constructor(..._args: any[]) {
        super();
      }
    };
  },
}));

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  let userRepository: any;
  let configService: any;

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue("jwt-secret-key"),
    };

    strategy = new JwtStrategy(configService, userRepository);
  });

  describe("validate", () => {
    it("should return user if found and active", async () => {
      const mockUser = { id: "user-1", isActive: true, email: "test@test.com" };
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await strategy.validate({ sub: "user-1" });

      expect(result).toEqual(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
    });

    it("should throw if user not found", async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(strategy.validate({ sub: "unknown" })).rejects.toThrow(
        ApiErrorResponse,
      );
    });

    it("should throw if user is not active", async () => {
      userRepository.findOne.mockResolvedValue({
        id: "user-1",
        isActive: false,
      });

      await expect(strategy.validate({ sub: "user-1" })).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });
});
