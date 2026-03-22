import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsUUID,
  Min,
} from "class-validator";
import { Currency } from "../entities/product.entity";

export class CreateProductDto {
  @ApiProperty({ description: "Название товара", example: "iPhone 15" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Цена покупки в копейках", example: 80000 })
  @IsNumber()
  @Min(0)
  purchase_price_cents: number;

  @ApiProperty({ description: "Цена продажи в копейках", example: 99900 })
  @IsNumber()
  @Min(0)
  sale_price_cents: number;

  @ApiProperty({ description: "Количество товара на складе", example: 50 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ description: "Валюта", enum: Currency, example: Currency.UAH })
  @IsEnum(Currency)
  currency: Currency;

  @ApiPropertyOptional({ description: "ID поставщика", example: "uuid" })
  @IsOptional()
  @IsUUID()
  supplier_id?: string | null;
}
