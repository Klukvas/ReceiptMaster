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

const USER_ID = "2b0f9a8e-4c1d-4e5f-9a6b-7c8d9e0f1a2b";

/**
 * A users repository whose one query answers with `user` and its stored token version
 * (the column is read raw, beside the entity).
 */
const repositoryReturning = (
  user: Record<string, unknown> | null,
  tokenVersion = 0,
) => {
  const builder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn().mockResolvedValue({
      entities: user ? [user] : [],
      raw: user ? [{ current_token_version: tokenVersion }] : [],
    }),
  };
  return { createQueryBuilder: jest.fn().mockReturnValue(builder), builder };
};

describe("JwtStrategy", () => {
  const configService: any = {
    get: jest.fn().mockReturnValue("jwt-secret-key"),
  };
  const activeUser = { id: USER_ID, isActive: true, email: "test@test.com" };
  const strategyOn = (repository: unknown) =>
    new JwtStrategy(configService, repository as any);

  const UNAUTHORIZED = { statusCode: 401, errorCode: "UNAUTHORIZED" };

  describe("validate", () => {
    it("should return user if found and active", async () => {
      const repository = repositoryReturning(activeUser);

      const result = await strategyOn(repository).validate({
        sub: USER_ID,
        tv: 0,
      });

      expect(result).toEqual(activeUser);
      expect(repository.builder.where).toHaveBeenCalledWith("user.id = :id", {
        id: USER_ID,
      });
      // One query per request: the version comes with the user, as a raw column.
      expect(repository.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(repository.builder.addSelect).toHaveBeenCalledWith(
        `"user"."token_version"`,
        "current_token_version",
      );
    });

    it("should throw if user not found", async () => {
      await expect(
        strategyOn(repositoryReturning(null)).validate({
          sub: "5f0c8a7e-1d2b-4c3a-8e9f-0a1b2c3d4e5f",
        }),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it.each(["admin", "1", 42, undefined, null, { id: USER_ID }])(
      "answers a signed token whose subject %p is not a user id with 401, without a query",
      async (sub) => {
        const repository = repositoryReturning(activeUser);
        await expect(
          strategyOn(repository).validate({ sub }),
        ).rejects.toMatchObject(UNAUTHORIZED);
        expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it("should throw if user is not active", async () => {
      await expect(
        strategyOn(
          repositoryReturning({ id: USER_ID, isActive: false }),
        ).validate({ sub: USER_ID }),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("token version (tv claim)", () => {
    it("accepts a token without the claim while the account is at version 0 (issued before the claim existed)", async () => {
      await expect(
        strategyOn(repositoryReturning(activeUser, 0)).validate({
          sub: USER_ID,
        }),
      ).resolves.toEqual(activeUser);
    });

    it("rejects a token without the claim once the account's version moved on", async () => {
      await expect(
        strategyOn(repositoryReturning(activeUser, 1)).validate({
          sub: USER_ID,
        }),
      ).rejects.toMatchObject(UNAUTHORIZED);
    });

    it("accepts a token carrying the current version", async () => {
      await expect(
        strategyOn(repositoryReturning(activeUser, 5)).validate({
          sub: USER_ID,
          tv: 5,
        }),
      ).resolves.toEqual(activeUser);
    });

    it.each([4, 6, "5", null])(
      "answers a token with version %p when the account is at 5 with the invalid-token 401",
      async (tv) => {
        await expect(
          strategyOn(repositoryReturning(activeUser, 5)).validate({
            sub: USER_ID,
            tv,
          }),
        ).rejects.toMatchObject(UNAUTHORIZED);
      },
    );
  });
});
