import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsDateString } from "class-validator";

export class DateRangeDto {
  @ApiPropertyOptional({
    description: "Start date for filtering (ISO 8601 string)",
    example: "2025-01-01",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "End date for filtering (ISO 8601 string)",
    example: "2025-12-31",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  get startDateParsed(): Date | undefined {
    return this.startDate ? new Date(this.startDate) : undefined;
  }

  get endDateParsed(): Date | undefined {
    return this.endDate ? new Date(this.endDate) : undefined;
  }
}
