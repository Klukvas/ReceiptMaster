import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { MIN_PASSWORD_LENGTH } from "./password-policy";

export class ChangePasswordDto {
  @ApiProperty({
    description: "Текущий пароль",
    example: "oldPassword123",
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: "Новый пароль",
    example: "newPassword123",
    minLength: MIN_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  newPassword: string;

  @ApiProperty({
    description: "Подтверждение нового пароля",
    example: "newPassword123",
    minLength: MIN_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  confirmPassword: string;
}
