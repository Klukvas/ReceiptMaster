import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  TAX_ID_KINDS,
  TaxIdKind,
} from "../../../common/utils/ua-requisites.util";
import { CreateRecipientDto } from "./create-recipient.dto";

/**
 * Every field is optional. On update — not on create — `null` clears an
 * optional contact field: the `@IsOptional` that PartialType adds lets null
 * through and the service stores NULL. That also lets `name: null` through, so
 * the service refuses it with 400. Only the Swagger metadata of the contact
 * fields is redeclared here; the validation rules are inherited unchanged.
 */
export class UpdateRecipientDto extends PartialType(CreateRecipientDto) {
  @ApiPropertyOptional({
    description: "Email получателя; null очищает",
    example: "ivan@example.com",
    nullable: true,
  })
  email?: string | null;

  @ApiPropertyOptional({
    description: "Телефон получателя; null очищает",
    example: "+7 (999) 123-45-67",
    nullable: true,
  })
  phone?: string | null;

  @ApiPropertyOptional({
    description: "Адрес получателя; null очищает",
    example: "г. Москва, ул. Тверская, д. 1",
    nullable: true,
  })
  address?: string | null;

  @ApiPropertyOptional({
    description: "Юридическое название; null очищает",
    nullable: true,
  })
  legal_name?: string | null;

  @ApiPropertyOptional({
    description:
      "ЄДРПОУ (8) или РНОКПП (10); вид пересчитывается; null очищает и вид",
    nullable: true,
  })
  tax_id?: string | null;

  @ApiPropertyOptional({
    description: "Вид налогового номера; сам по себе очистить нельзя",
    enum: TAX_ID_KINDS,
    nullable: true,
  })
  tax_id_kind?: TaxIdKind | null;

  @ApiPropertyOptional({
    description: "IBAN (UA...); null очищает",
    nullable: true,
  })
  iban?: string | null;

  @ApiPropertyOptional({
    description: "Название банка; null очищает",
    nullable: true,
  })
  bank_name?: string | null;

  @ApiPropertyOptional({
    description: "Юридический адрес; null очищает",
    nullable: true,
  })
  legal_address?: string | null;
}
