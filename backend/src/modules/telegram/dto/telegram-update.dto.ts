import {
  IsOptional,
  IsString,
  IsNumber,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class TelegramUserDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;
}

export class TelegramContactDto {
  @IsString()
  phone_number: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsNumber()
  user_id?: number;
}

export class TelegramMessageDto {
  @IsNumber()
  message_id: number;

  @ValidateNested()
  @Type(() => TelegramUserDto)
  from: TelegramUserDto;

  @IsNumber()
  date: number;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramContactDto)
  contact?: TelegramContactDto;
}

export class TelegramUpdateDto {
  @IsNumber()
  update_id: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramMessageDto)
  message?: TelegramMessageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramMessageDto)
  edited_message?: TelegramMessageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramMessageDto)
  callback_query?: TelegramMessageDto;
}
