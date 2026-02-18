import { ApiProperty } from "@nestjs/swagger";
import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsPositive,
  Min,
  IsOptional,
  IsInt,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateOrderItemDto {
  @ApiProperty({
    description: "ID товара",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: "Количество", example: 2, minimum: 1 })
  @IsPositive()
  @Min(1)
  qty: number;

  @ApiProperty({
    description:
      "Цена за единицу в копейках (опционально, по умолчанию используется цена из продукта)",
    example: 99900,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description: "ID получателя",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsUUID()
  recipientId: string;

  @ApiProperty({
    description: "Позиции заказа",
    type: [CreateOrderItemDto],
    example: [{ productId: "123e4567-e89b-12d3-a456-426614174000", qty: 2 }],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "Order must contain at least one item" })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
