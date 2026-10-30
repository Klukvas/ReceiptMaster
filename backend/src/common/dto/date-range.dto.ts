import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsDateString } from "class-validator";

/** A calendar date with no time: it names a whole UTC day, not its first instant. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class DateRangeDto {
  @ApiPropertyOptional({
    description: "Start date for filtering (ISO 8601 string)",
    example: "2025-01-01",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      "End date for filtering (ISO 8601 string). A date without a time (YYYY-MM-DD) includes that whole UTC day; a full timestamp is an exact upper bound.",
    example: "2025-12-31",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  get startDateParsed(): Date | undefined {
    return this.startDate ? new Date(this.startDate) : undefined;
  }

  get endDateParsed(): Date | undefined {
    if (!this.endDate) return undefined;
    return new Date(
      DATE_ONLY.test(this.endDate)
        ? `${this.endDate}T23:59:59.999Z`
        : this.endDate,
    );
  }
}
