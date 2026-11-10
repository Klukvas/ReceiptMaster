import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
} from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";
import {
  IsUaIban,
  IsUaTaxId,
  NormalizedIban,
} from "../../../common/dto/ua-requisites";
import {
  TAX_ID_KINDS,
  TaxIdKind,
} from "../../../common/utils/ua-requisites.util";
import {
  PHONE_PATTERN,
  PHONE_PATTERN_MESSAGE,
  Trimmed,
} from "../../../common/dto/trimmed-string";

export class CreateRecipientDto {
  @ApiProperty({ description: "Имя получателя", example: "Иван Иванов" })
  @Trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: "Email получателя",
    example: "ivan@example.com",
  })
  @IsOptional()
  @NormalizedEmail()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: "Телефон получателя",
    example: "+7 (999) 123-45-67",
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(50)
  @Matches(PHONE_PATTERN, { message: PHONE_PATTERN_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    description: "Адрес получателя",
    example: "г. Москва, ул. Тверская, д. 1",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @ApiPropertyOptional({
    description: "Юридическое название (для документов)",
    example: 'ТОВ "Ромашка"',
    maxLength: 255,
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(255)
  legal_name?: string;

  @ApiPropertyOptional({
    description:
      "ЄДРПОУ (8 цифр) или РНОКПП (10 цифр); вид определяется по длине",
    example: "12345678",
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @IsUaTaxId()
  tax_id?: string;

  @ApiPropertyOptional({
    description: "Вид налогового номера; должен совпадать с длиной tax_id",
    enum: TAX_ID_KINDS,
  })
  @IsOptional()
  @IsIn(TAX_ID_KINDS)
  tax_id_kind?: TaxIdKind;

  @ApiPropertyOptional({
    description:
      "IBAN украинского счёта; пробелы и регистр нормализуются, хранится компактно",
    example: "UA213223130000026007233566001",
  })
  @IsOptional()
  @NormalizedIban()
  @IsString()
  @IsUaIban()
  iban?: string;

  @ApiPropertyOptional({ description: "Название банка", maxLength: 200 })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(200)
  bank_name?: string;

  @ApiPropertyOptional({
    description: "Юридический адрес",
    maxLength: 1000,
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(1000)
  legal_address?: string;
}
