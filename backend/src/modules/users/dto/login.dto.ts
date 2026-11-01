import { IsEmail, IsString, MinLength } from "class-validator";
import { NormalizedEmail } from "../../../common/dto/normalized-email";

export class LoginDto {
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
