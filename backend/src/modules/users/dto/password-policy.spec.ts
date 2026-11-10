import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangePasswordDto } from "./change-password.dto";
import { LoginDto } from "./login.dto";
import { RegisterDto } from "./register.dto";
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_LONG_MESSAGE,
} from "./password-policy";

const failingProperties = async (dto: object): Promise<string[]> =>
  (await validate(dto)).map((error) => error.property);

const passwordOfLength = (length: number) => "p".repeat(length);
const cyrillicPasswordOfLength = (length: number) => "п".repeat(length);

const changePassword = (newPassword: string) =>
  plainToInstance(ChangePasswordDto, {
    currentPassword: "old123",
    newPassword,
    confirmPassword: newPassword,
  });

const register = (password: string) =>
  plainToInstance(RegisterDto, { email: "a@example.com", password });

const messagesFor = async (dto: object, property: string): Promise<string[]> =>
  (await validate(dto))
    .filter((error) => error.property === property)
    .flatMap((error) => Object.values(error.constraints ?? {}));

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

  it("refuses a new password longer than the 72 bytes bcrypt hashes", async () => {
    expect(MAX_PASSWORD_BYTES).toBe(72);
    expect(
      await failingProperties(changePassword(passwordOfLength(72))),
    ).toHaveLength(0);
    expect(
      await failingProperties(changePassword(passwordOfLength(73))),
    ).toContain("newPassword");
  });

  it("counts UTF-8 bytes, not characters: 37 Cyrillic letters are 74 bytes", async () => {
    expect(
      await failingProperties(changePassword(cyrillicPasswordOfLength(36))),
    ).toHaveLength(0);
    expect(
      await messagesFor(
        changePassword(cyrillicPasswordOfLength(37)),
        "newPassword",
      ),
    ).toContain(PASSWORD_TOO_LONG_MESSAGE);
  });

  it("applies the same byte limit at registration", async () => {
    expect(
      await failingProperties(register(passwordOfLength(72))),
    ).toHaveLength(0);
    expect(await failingProperties(register(passwordOfLength(73)))).toContain(
      "password",
    );
    expect(
      await failingProperties(register(cyrillicPasswordOfLength(36))),
    ).toHaveLength(0);
    expect(
      await messagesFor(register(cyrillicPasswordOfLength(37)), "password"),
    ).toContain(PASSWORD_TOO_LONG_MESSAGE);
  });

  it("still lets an existing 6-character password sign in", async () => {
    const dto = plainToInstance(LoginDto, {
      email: "old@example.com",
      password: "abc123",
    });

    expect(await failingProperties(dto)).toHaveLength(0);
  });
});
