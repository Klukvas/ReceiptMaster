import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  validateSync,
} from "class-validator";
import { Trimmed } from "../../../common/dto/trimmed-string";
import { ApiErrors } from "../../../common/errors/ApiError";

export const MAX_PREFIX_LENGTH = 16;
export const MIN_PADDING = 1;
export const MAX_PADDING = 9;
export const MAX_START_NUMBER = 2_000_000_000;

/**
 * Letters, digits and a few separators. `/`, `\`, `"` and control characters are not in
 * the set: they would break the download file name and HTML attributes.
 */
// Length is checked by @MaxLength, so a too-long prefix reports its length, not its characters.
const PREFIX_PATTERN = /^[\p{L}\p{N}._ -]*$/u;
export class UpdateNumberingDto {
  @ApiProperty({ maxLength: MAX_PREFIX_LENGTH })
  @Trimmed()
  @IsString()
  @MaxLength(MAX_PREFIX_LENGTH)
  @Matches(PREFIX_PATTERN, {
    message:
      'prefix may contain only letters, digits and . _ - and spaces (no / \\ " or control characters)',
  })
  // A prefix ending in a digit would let two formats print the same text for different
  // counter values. Any Unicode digit counts here (the migration's CHECK knows only 0-9,
  // which is what the counter value is read back with).
  @Matches(/^(?![\s\S]*\p{N}$)/u, {
    message: "prefix must not end with a digit",
  })
  prefix: string;

  @ApiProperty({ minimum: MIN_PADDING, maximum: MAX_PADDING })
  @IsInt()
  @Min(MIN_PADDING)
  @Max(MAX_PADDING)
  padding: number;

  @ApiProperty()
  @IsBoolean()
  includeYear: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_START_NUMBER })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_START_NUMBER)
  startNumber?: number;
}

/**
 * Validates a raw request body. Done by hand (not by the global ValidationPipe) so every
 * refusal is a 400 VALIDATION_ERROR that names the field.
 */
export function parseUpdateNumbering(body: unknown): UpdateNumberingDto {
  const input =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? body
      : {};
  const dto = plainToInstance(UpdateNumberingDto, input);
  const [first] = validateSync(dto, {
    whitelist: true,
    forbidUnknownValues: false,
  });
  if (first) {
    const message = Object.values(first.constraints ?? {})[0] ?? "is invalid";
    throw ApiErrors.VALIDATION_ERROR(first.property, message);
  }
  return dto;
}
