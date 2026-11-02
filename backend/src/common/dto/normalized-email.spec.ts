import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { LoginDto } from "../../modules/users/dto/login.dto";
import { RegisterDto } from "../../modules/users/dto/register.dto";
import { normalizeEmail } from "./normalized-email";

describe("normalizeEmail", () => {
  it("trims and lowercases strings", () => {
    expect(normalizeEmail("  A-Auth-1@UITEST.local ")).toBe(
      "a-auth-1@uitest.local",
    );
  });

  it("leaves non-strings for the validator to reject", () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(42)).toBe(42);
  });
});

describe("email normalisation in auth DTOs", () => {
  it("lowercases the email on register so case variants map to one account", async () => {
    const dto = plainToInstance(RegisterDto, {
      email: "Mixed.Case@Example.COM",
      password: "secret-123",
    });

    expect(dto.email).toBe("mixed.case@example.com");
    expect(await validate(dto)).toHaveLength(0);
  });

  it("lowercases the email on login, e.g. when a phone capitalises the first letter", () => {
    const dto = plainToInstance(LoginDto, {
      email: "A-AUTH-1@uitest.local",
      password: "secret-123",
    });

    expect(dto.email).toBe("a-auth-1@uitest.local");
  });
});
