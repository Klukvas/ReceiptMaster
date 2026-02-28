import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsArray,
  IsUUID,
} from "class-validator";

export class CreateSupplierDto {
  @ApiProperty({ description: "Название поставщика", example: "ООО Поставщик" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: "Email поставщика",
    example: "supplier@example.com",
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: "Телефон поставщика",
    example: "+380 50 123 4567",
  })
  @IsOptional()
  @IsString()
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
