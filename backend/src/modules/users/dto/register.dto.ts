import { IsEmail, IsString, MinLength, MaxLength } from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";
import { MIN_PASSWORD_LENGTH } from "./password-policy";

export class RegisterDto {
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(50)
  password: string;
}
