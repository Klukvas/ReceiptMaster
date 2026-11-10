import { IsEmail, IsString, MinLength } from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";
import { MaxPasswordBytes, MIN_PASSWORD_LENGTH } from "./password-policy";

export class RegisterDto {
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxPasswordBytes()
  password: string;
}
