import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
} from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";
import {
  PHONE_PATTERN,
  PHONE_PATTERN_MESSAGE,
  Trimmed,
} from "../../../common/dto/trimmed-string";

export class CreateRecipientDto {
  @ApiProperty({ description: "Имя получателя", example: "Иван Иванов" })
  @Trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: "Email получателя",
    example: "ivan@example.com",
  })
  @IsOptional()
  @NormalizedEmail()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: "Телефон получателя",
    example: "+7 (999) 123-45-67",
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(50)
  @Matches(PHONE_PATTERN, { message: PHONE_PATTERN_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    description: "Адрес получателя",
    example: "г. Москва, ул. Тверская, д. 1",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;
}
