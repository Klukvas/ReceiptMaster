import { IsEmail, IsString, MinLength, MaxLength } from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";

export class RegisterDto {
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;
}
