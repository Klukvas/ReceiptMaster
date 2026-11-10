import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsPositive,
  Max,
  Min,
  IsString,
  IsEnum,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

export enum SortOrder {
  ASC = "ASC",
  DESC = "DESC",
}

/** Deep offsets are a table scan per request; no tenant pages a million rows deep. */
export const MAX_PAGE_OFFSET = 1_000_000;

export class PaginationDto {
  @ApiPropertyOptional({
    description: "Количество элементов на странице",
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Смещение для пагинации",
    minimum: 0,
    maximum: MAX_PAGE_OFFSET,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(MAX_PAGE_OFFSET)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: "Поисковый запрос",
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: "Поле для сортировки",
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: "Направление сортировки: ASC или DESC",
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}
