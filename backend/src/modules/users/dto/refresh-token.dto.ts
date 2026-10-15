import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export const REFRESH_TOKEN_PATTERN = /^[a-f0-9]{128}$/;

export class RefreshTokenDto {
  @ApiProperty({ description: "128-character hexadecimal refresh token" })
  @IsString()
  @Matches(REFRESH_TOKEN_PATTERN)
  refresh_token: string;
}
