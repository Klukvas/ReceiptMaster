import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { Trimmed } from "../../../common/dto/trimmed-string";

/** The column `void_reason` holds at most 500 characters. */
export const MAX_VOID_REASON_LENGTH = 500;

export class VoidReceiptDto {
  @ApiPropertyOptional({ maxLength: MAX_VOID_REASON_LENGTH })
  @Trimmed()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_VOID_REASON_LENGTH)
  reason?: string;
}
