import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsArray,
  IsUUID,
  Matches,
} from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";
import {
  PHONE_PATTERN,
  PHONE_PATTERN_MESSAGE,
  Trimmed,
} from "../../../common/dto/trimmed-string";

export class CreateSupplierDto {
  @ApiProperty({ description: "Название поставщика", example: "ООО Поставщик" })
  @Trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: "Email поставщика",
    example: "supplier@example.com",
  })
  @IsOptional()
  @NormalizedEmail()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: "Телефон поставщика",
    example: "+380 50 123 4567",
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(50)
  @Matches(PHONE_PATTERN, { message: PHONE_PATTERN_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    description: "Адрес поставщика",
    example: "г. Киев, ул. Центральная, 1",
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: "Контактное лицо",
    example: "Иван Иванов",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @ApiPropertyOptional({
    description: "Заметки",
    example: "Основной поставщик",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "ID продуктов для привязки",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  productIds?: string[];
}
