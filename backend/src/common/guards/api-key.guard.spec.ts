import { ApiKeyGuard } from "./api-key.guard";
import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiErrorResponse } from "../errors/ApiError";

describe("ApiKeyGuard", () => {
  let guard: ApiKeyGuard;
  let configService: jest.Mocked<ConfigService>;

  const createMockContext = (apiKey?: string): ExecutionContext => {
    const headers: Record<string, string> = {};
    if (apiKey !== undefined) {
      headers["x-api-key"] = apiKey;
    }

    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as any;
  };

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as any;
    guard = new ApiKeyGuard(configService);
  });

  it("should allow access when API_KEY is not configured", () => {
    configService.get.mockReturnValue(undefined);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should allow access when API key matches", () => {
    configService.get.mockReturnValue("secret-key");
    const context = createMockContext("secret-key");

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should throw when API key is missing", () => {
    configService.get.mockReturnValue("secret-key");
    const context = createMockContext();

    expect(() => guard.canActivate(context)).toThrow(ApiErrorResponse);
  });

  it("should throw when API key does not match", () => {
    configService.get.mockReturnValue("secret-key");
    const context = createMockContext("wrong-key");

    expect(() => guard.canActivate(context)).toThrow(ApiErrorResponse);
  });

  it("should throw with UNAUTHORIZED error code", () => {
    configService.get.mockReturnValue("secret-key");
    const context = createMockContext("wrong-key");

    try {
      guard.canActivate(context);
      fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiErrorResponse);
      expect((error as ApiErrorResponse).errorCode).toBe("UNAUTHORIZED");
      expect((error as ApiErrorResponse).statusCode).toBe(401);
    }
  });
});
