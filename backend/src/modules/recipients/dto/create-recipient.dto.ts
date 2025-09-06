import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateRecipientDto {
  @ApiProperty({ description: 'Имя получателя', example: 'Иван Иванов' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Email получателя', example: 'ivan@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Телефон получателя', example: '+7 (999) 123-45-67' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Адрес получателя', example: 'г. Москва, ул. Тверская, д. 1' })
  @IsOptional()
  @IsString()
  address?: string;
}
