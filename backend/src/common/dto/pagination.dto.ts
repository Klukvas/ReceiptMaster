import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsPositive, Max, Min } from "class-validator";
import { Type } from "class-transformer";

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
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  offset?: number = 0;
}
