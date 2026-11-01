import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsUUID,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { MAX_INT4, Trimmed } from "../../../common/dto/trimmed-string";
import { Currency } from "../entities/product.entity";

export class CreateProductDto {
  @ApiProperty({ description: "Название товара", example: "iPhone 15" })
  @Trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: "Цена покупки в копейках", example: 80000 })
  @IsNumber()
  @Min(0)
  @Max(MAX_INT4)
  purchase_price_cents: number;

  @ApiProperty({ description: "Цена продажи в копейках", example: 99900 })
  @IsNumber()
  @Min(0)
  @Max(MAX_INT4)
  sale_price_cents: number;

  @ApiProperty({ description: "Количество товара на складе", example: 50 })
  @IsNumber()
  @Min(0)
  @Max(MAX_INT4)
  quantity: number;

  @ApiProperty({ description: "Валюта", enum: Currency, example: Currency.UAH })
  @IsEnum(Currency)
  currency: Currency;

  @ApiPropertyOptional({
    description: "ID поставщика (null снимает поставщика)",
    example: "uuid",
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  supplier_id?: string | null;
}
