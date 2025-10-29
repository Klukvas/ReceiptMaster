import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

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
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: "Пароль должен содержать минимум 6 символов" })
  newPassword: string;

  @ApiProperty({
    description: "Подтверждение нового пароля",
    example: "newPassword123",
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: "Пароль должен содержать минимум 6 символов" })
  confirmPassword: string;
}

