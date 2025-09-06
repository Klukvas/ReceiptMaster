import { ApiProperty } from "@nestjs/swagger";
import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsPositive,
  Min,
  IsOptional,
} from "class-validator";
import { Type } from "class-transformer";

export class UpdateOrderItemDto {
  @ApiProperty({
    description: "Product ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: "Quantity", example: 2, minimum: 1 })
  @IsPositive()
  @Min(1)
  qty: number;
}

export class UpdateOrderDto {
  @ApiProperty({
    description: "Recipient ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
    required: false,
  })
  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @ApiProperty({
    description: "Order items",
    type: [UpdateOrderItemDto],
    example: [{ productId: "123e4567-e89b-12d3-a456-426614174000", qty: 2 }],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  items?: UpdateOrderItemDto[];
}
