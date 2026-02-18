import { ApiProperty } from "@nestjs/swagger";
import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsPositive,
  Min,
  IsOptional,
  IsInt,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { PaymentStatus } from "../entities/order.entity";

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

  @ApiProperty({
    description:
      "Unit price in cents (optional, defaults to product sale price)",
    example: 99900,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;
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

  @ApiProperty({
    description: "Payment status",
    enum: PaymentStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}
