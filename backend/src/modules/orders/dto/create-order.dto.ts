import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, ValidateNested, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @ApiProperty({ description: 'ID товара', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Количество', example: 2, minimum: 1 })
  @IsPositive()
  @Min(1)
  qty: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'ID получателя', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  recipientId: string;

  @ApiProperty({ 
    description: 'Позиции заказа', 
    type: [CreateOrderItemDto],
    example: [{ productId: '123e4567-e89b-12d3-a456-426614174000', qty: 2 }]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
