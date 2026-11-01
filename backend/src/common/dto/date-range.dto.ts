import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsDateString } from "class-validator";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  /**
   * A date-only end ("2026-11-01") means that whole day, so it resolves to the last
   * millisecond of it; otherwise orders created today fall outside "up to today".
   */
  get endDateParsed(): Date | undefined {
    if (!this.endDate) return undefined;
    return DATE_ONLY_PATTERN.test(this.endDate)
      ? new Date(`${this.endDate}T23:59:59.999Z`)
      : new Date(this.endDate);
  }
}
