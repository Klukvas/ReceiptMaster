import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { DateRangeDto } from "../../../common/dto/date-range.dto";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { Trimmed } from "../../../common/dto/trimmed-string";
import { DocumentType, ReceiptStatus } from "../entities/receipt.entity";

export const DEFAULT_DOCUMENT_PAGE_SIZE = 20;
/** Far beyond any real list, and well inside the database's bigint. */
export const MAX_DOCUMENT_OFFSET = 1_000_000;
export const MAX_DOCUMENT_SEARCH_LENGTH = 100;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` naming a real day: February 30th matches the pattern but is no date. */
@ValidatorConstraint({ name: "isCalendarDay" })
class CalendarDayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    );
  }
  defaultMessage({ property }: ValidationArguments): string {
    return `${property} must be a calendar date, YYYY-MM-DD`;
  }
}

/** A cleared filter control sends an empty value; that means "no filter", not an error. */
const emptyToUndefined = () =>
  Transform(({ value }) => (value === "" ? undefined : value));

/**
 * Query of `GET /receipts`. Every key the client's server-pagination hook sends is
 * declared here (offset, limit, search, sortBy, sortOrder, startDate, endDate), plus the
 * document filters.
 */
export class ListDocumentsQueryDto extends IntersectionType(
  PaginationDto,
  DateRangeDto,
) {
  @ApiPropertyOptional({
    maximum: 100,
    minimum: 1,
    default: DEFAULT_DOCUMENT_PAGE_SIZE,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  override limit?: number = DEFAULT_DOCUMENT_PAGE_SIZE;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_DOCUMENT_OFFSET, default: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_DOCUMENT_OFFSET)
  override offset?: number = 0;

  @ApiPropertyOptional({ enum: DocumentType })
  @emptyToUndefined()
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @ApiPropertyOptional({ enum: ReceiptStatus })
  @emptyToUndefined()
  @IsOptional()
  @IsEnum(ReceiptStatus)
  status?: ReceiptStatus;

  @ApiPropertyOptional({
    description:
      "Matches the document number, the recipient's name or legal name, and, for digits (optionally with #), the order number",
    maxLength: MAX_DOCUMENT_SEARCH_LENGTH,
  })
  @Trimmed()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DOCUMENT_SEARCH_LENGTH)
  override search?: string;

  @ApiPropertyOptional({
    description:
      "created_at (default), number, document_type or status; anything else is ignored",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  override sortBy?: string;

  @ApiPropertyOptional({
    example: "2026-01-01",
    description:
      "A calendar day in the account's document time zone (Europe/Kyiv unless configured); the whole day is included",
  })
  @emptyToUndefined()
  @IsOptional()
  @Validate(CalendarDayConstraint)
  override startDate?: string;

  @ApiPropertyOptional({
    example: "2026-12-31",
    description: "Same as startDate; the whole day is included",
  })
  @emptyToUndefined()
  @IsOptional()
  @Validate(CalendarDayConstraint)
  override endDate?: string;
}

/** What the service reads from the query; the DTO's inherited getters are not needed. */
export type DocumentListQuery = Partial<
  Pick<
    ListDocumentsQueryDto,
    | "offset"
    | "limit"
    | "type"
    | "status"
    | "search"
    | "sortBy"
    | "sortOrder"
    | "startDate"
    | "endDate"
  >
>;
