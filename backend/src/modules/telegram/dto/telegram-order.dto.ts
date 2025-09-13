import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class TelegramOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  qty: number;
}

export class TelegramUserDto {
  @IsString()
  @IsNotEmpty()
  telegram_user_id: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

export class CreateTelegramOrderDto {
  @ValidateNested()
  @Type(() => TelegramUserDto)
  user: TelegramUserDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelegramOrderItemDto)
  items: TelegramOrderItemDto[];
}
