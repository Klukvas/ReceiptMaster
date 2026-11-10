import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import {
  MAX_PASSWORD_BYTES,
  MaxPasswordBytes,
  MIN_PASSWORD_LENGTH,
} from "./password-policy";

export class ChangePasswordDto {
  @ApiProperty({
    description: "Текущий пароль",
    example: "oldPassword123",
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: `Новый пароль: не короче ${MIN_PASSWORD_LENGTH} символов и не длиннее ${MAX_PASSWORD_BYTES} байт в UTF-8 (bcrypt хэширует только первые ${MAX_PASSWORD_BYTES} байта)`,
    example: "newPassword123",
    minLength: MIN_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  @MaxPasswordBytes()
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
