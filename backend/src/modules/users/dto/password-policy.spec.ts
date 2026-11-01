import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangePasswordDto } from "./change-password.dto";
import { LoginDto } from "./login.dto";
import { RegisterDto } from "./register.dto";
import { MIN_PASSWORD_LENGTH } from "./password-policy";

const failingProperties = async (dto: object): Promise<string[]> =>
  (await validate(dto)).map((error) => error.property);

const passwordOfLength = (length: number) => "p".repeat(length);

describe("password policy", () => {
  it("requires at least 8 characters for a new account", async () => {
    const tooShort = plainToInstance(RegisterDto, {
      email: "a@example.com",
      password: passwordOfLength(MIN_PASSWORD_LENGTH - 1),
    });
    const longEnough = plainToInstance(RegisterDto, {
      email: "a@example.com",
      password: passwordOfLength(MIN_PASSWORD_LENGTH),
    });

    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(await failingProperties(tooShort)).toContain("password");
    expect(await failingProperties(longEnough)).toHaveLength(0);
  });

  it("requires at least 8 characters for a new password, but not for the current one", async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: "old123", // an account created under the old 6-character minimum
      newPassword: passwordOfLength(MIN_PASSWORD_LENGTH - 1),
      confirmPassword: passwordOfLength(MIN_PASSWORD_LENGTH - 1),
    });

    const failing = await failingProperties(dto);

    expect(failing).toEqual(
      expect.arrayContaining(["newPassword", "confirmPassword"]),
    );
    expect(failing).not.toContain("currentPassword");
  });

  it("still lets an existing 6-character password sign in", async () => {
    const dto = plainToInstance(LoginDto, {
      email: "old@example.com",
      password: "abc123",
    });

    expect(await failingProperties(dto)).toHaveLength(0);
  });
});
